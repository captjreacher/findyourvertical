import { useCallback, useEffect, useState } from 'react';
import {
  getCreatorRelationships,
  createCreatorAccessInvitation,
  type CreatorRelationshipListRow,
} from '@/lib/creators-api';
import type { RelationshipState } from '@/lib/creator-relationship';

/**
 * Agency console: Creator Relationship management (FYV ↔ FMF identity mapping +
 * access lifecycle). Agency-only — it lives inside the AuthGate/is_agency()-gated
 * cockpit, so creators can never reach it.
 *
 * It surfaces ONLY the FYV-owned relationship_state (draft → invited → accepted →
 * active) — never FMF onboarding_status / readiness / operational status. The
 * "Invite" action reuses the existing PR #21 endpoint (POST /api/creators/{id}/invite)
 * via createCreatorAccessInvitation — no competing invitation system.
 */

const STATE_BADGE: Record<RelationshipState, string> = {
  draft: 'bg-white/10 text-charcoal-2',
  invited: 'bg-accent/15 text-accent',
  accepted: 'bg-warn/15 text-warn',
  active: 'bg-success/15 text-success',
};

function shortId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

interface RowInvite {
  busy: boolean;
  link?: string;
  error?: string;
  copied?: boolean;
}

export function CreatorRelationships() {
  const [rows, setRows] = useState<CreatorRelationshipListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invites, setInvites] = useState<Record<string, RowInvite>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await getCreatorRelationships());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load creator relationships.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const invite = async (row: CreatorRelationshipListRow) => {
    setInvites(s => ({ ...s, [row.relationship_id]: { busy: true } }));
    try {
      // Email omitted → the RPC resolves the creator's profile email server-side.
      const result = await createCreatorAccessInvitation(row.fyv_creator_id, row.fmf_creator_id);
      setInvites(s => ({ ...s, [row.relationship_id]: { busy: false, link: result.acceptUrl } }));
      await load(); // reflect draft → invited
    } catch (e) {
      setInvites(s => ({
        ...s,
        [row.relationship_id]: { busy: false, error: e instanceof Error ? e.message : 'Invite failed.' },
      }));
    }
  };

  const copy = async (relationshipId: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setInvites(s => ({ ...s, [relationshipId]: { ...s[relationshipId], copied: true } }));
      setTimeout(() => setInvites(s => ({ ...s, [relationshipId]: { ...s[relationshipId], copied: false } })), 1200);
    } catch {
      /* clipboard unavailable — the link input is still selectable */
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">Creator Relationships</h1>
          <p className="mt-1 text-sm text-charcoal-2">
            FYV ↔ FMF identity mapping and access lifecycle (draft → invited → accepted → active).
            Canonical IDs only — the FYV access relationship is separate from FMF operational state.
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="btn-secondary text-xs">
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && <p className="text-sm text-pink" role="alert">{error}</p>}

      <div className="cockpit-card-pad overflow-x-auto">
        {loading ? (
          <p className="text-sm text-charcoal-2" role="status">Loading relationships…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-charcoal-2">
            No creator relationships yet. Relationships are seeded/created as creators are mapped to FMF.
          </p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-charcoal-2">
                <th className="py-2 pr-4">Creator</th>
                <th className="py-2 pr-4">FYV creator id</th>
                <th className="py-2 pr-4">FMF creator id</th>
                <th className="py-2 pr-4">Relationship</th>
                <th className="py-2 pr-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const inv = invites[row.relationship_id] ?? { busy: false };
                const canInvite = row.relationship_state === 'draft' || row.relationship_state === 'invited';
                return (
                  <tr key={row.relationship_id} className="border-b border-white/5 align-top">
                    <td className="py-3 pr-4 font-medium text-charcoal">{row.creator_name ?? '—'}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-charcoal-2" title={row.fyv_creator_id}>{shortId(row.fyv_creator_id)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-charcoal-2" title={row.fmf_creator_id}>{shortId(row.fmf_creator_id)}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_BADGE[row.relationship_state]}`}>
                        {row.relationship_state}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {canInvite ? (
                        <div className="space-y-2">
                          <button onClick={() => void invite(row)} disabled={inv.busy} className="btn-primary text-xs">
                            {inv.busy ? 'Generating…' : row.relationship_state === 'draft' ? 'Invite creator' : 'Re-invite'}
                          </button>
                          {inv.error && <p className="text-xs text-pink" role="alert">{inv.error}</p>}
                          {inv.link && (
                            <div className="flex max-w-md gap-2">
                              <input readOnly value={inv.link} onFocus={e => e.currentTarget.select()} className="field-control w-full text-xs" />
                              <button onClick={() => void copy(row.relationship_id, inv.link!)} className="btn-secondary whitespace-nowrap text-xs">
                                {inv.copied ? 'Copied' : 'Copy link'}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-charcoal-2">
                          {row.relationship_state === 'accepted' ? 'Awaiting activation' : 'Active'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-charcoal-2">
        Email delivery is not configured — copy the generated access link and send it manually.
      </p>
    </div>
  );
}
