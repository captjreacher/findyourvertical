import { CreatorShell } from './CreatorShell';
import { useCreatorSession } from './CreatorGate';
import { signOut } from '@/lib/supabase';

export function CreatorAccount() {
  const { profile, session } = useCreatorSession();
  const rows: [string, string][] = [
    ['Name', profile.full_name || '—'],
    ['Model name', profile.model_name || '—'],
    ['Email', profile.email || session.user.email || '—'],
    ['Status', profile.status || '—'],
  ];

  return (
    <CreatorShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-charcoal">Account</h1>
        <p className="mt-1 text-sm text-charcoal-2">Your creator account details.</p>
        <section className="mt-5 rounded-2xl border border-white/10 bg-surface p-5">
          <dl className="grid gap-3">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-white/5 pb-2 last:border-0">
                <dt className="text-sm text-charcoal-2">{k}</dt>
                <dd className="text-sm font-medium text-charcoal">{v}</dd>
              </div>
            ))}
          </dl>
          <button onClick={() => void signOut()} className="btn-secondary mt-5 text-sm">Sign out</button>
        </section>
      </div>
    </CreatorShell>
  );
}
