import { useState } from 'react';
import { CreatorShell } from './CreatorShell';
import { createCreatorRetakeInvite } from '@/lib/creators-api';
export function RetakeAssessment() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function start() {
    setBusy(true); setError('');
    try {
      const invite = await createCreatorRetakeInvite();
      window.location.assign(`/#/a/${encodeURIComponent(invite.template_slug)}?ref=${encodeURIComponent(invite.invite_code)}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start a new assessment'); setBusy(false); }
  }
  return <CreatorShell><div className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-surface p-6">
    <h1 className="text-2xl font-bold">Retake Assessment</h1>
    <p className="my-4 text-sm leading-6 text-charcoal-2">Your new result may become your latest recommendation. Previous answers and reports remain in your history. An existing Personal Vertical Plan keeps its original assessment so your decisions are not replaced.</p>
    <button className="btn-primary" disabled={busy} onClick={() => void start()}>{busy ? 'Starting…' : 'Start a new assessment'}</button>
    {error && <p role="alert" className="mt-4 text-pink">{error}</p>}
  </div></CreatorShell>;
}
