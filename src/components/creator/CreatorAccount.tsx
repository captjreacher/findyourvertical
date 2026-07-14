import { useMemo, useState, type FormEvent } from 'react';
import { CreatorShell } from './CreatorShell';
import { useCreatorSession } from './CreatorGate';
import { signOut, updatePassword } from '@/lib/supabase';

function methodStatus(hasProvider: boolean | null): string {
  if (hasProvider === null) return 'Unavailable';
  return hasProvider ? 'Connected' : 'Not connected';
}

export function CreatorAccount() {
  const { profile, session } = useCreatorSession();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providers = useMemo(() => new Set(session.user.identities?.map(identity => identity.provider) ?? []), [session.user.identities]);
  const hasGoogle = providers.has('google');
  const hasPassword = providers.has('email') || providers.has('emailotp') || providers.has('password');

  const handlePasswordUpdate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      setBusy(false);
      return;
    }
    const { error } = await updatePassword(newPassword);
    if (error) {
      setError('We could not update your password right now. Please sign in again and try once more.');
    } else {
      setMessage('Your password has been saved.');
      setNewPassword('');
      setConfirmPassword('');
    }
    setBusy(false);
  };

  return (
    <CreatorShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-charcoal">Account</h1>
        <p className="mt-1 text-sm text-charcoal-2">Your creator account details and sign-in methods.</p>

        <section className="mt-5 rounded-2xl border border-white/10 bg-surface p-5">
          <dl className="grid gap-3">
            <div className="flex justify-between gap-4 border-b border-white/5 pb-2">
              <dt className="text-sm text-charcoal-2">Name</dt>
              <dd className="text-sm font-medium text-charcoal">{profile.full_name || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 pb-2">
              <dt className="text-sm text-charcoal-2">Email</dt>
              <dd className="text-sm font-medium text-charcoal">{profile.email || session.user.email || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 pb-2">
              <dt className="text-sm text-charcoal-2">Password</dt>
              <dd className="text-sm font-medium text-charcoal">{methodStatus(hasPassword)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 pb-2">
              <dt className="text-sm text-charcoal-2">Google</dt>
              <dd className="text-sm font-medium text-charcoal">{methodStatus(hasGoogle)}</dd>
            </div>
            <div className="flex justify-between gap-4 pb-2">
              <dt className="text-sm text-charcoal-2">Magic link</dt>
              <dd className="text-sm font-medium text-charcoal">{profile.email || session.user.email ? 'Available' : 'Unavailable'}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-surface p-5">
          <h2 className="text-lg font-bold text-charcoal">Set or change password</h2>
          <p className="mt-1 text-sm text-charcoal-2">
            Use this to add a password to an account that previously signed in with a magic link or Google.
          </p>
          <form onSubmit={handlePasswordUpdate} className="mt-4 grid gap-3">
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password"
              required
              className="field-control w-full"
            />
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              required
              className="field-control w-full"
            />
            <p className="text-xs leading-5 text-charcoal-2">Use at least 12 characters with a mix of words, numbers, and symbols.</p>
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
            </button>
          </form>
          {message && <p className="mt-3 text-sm text-success" role="status">{message}</p>}
          {error && <p className="mt-3 text-sm text-pink" role="alert">{error}</p>}
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-surface p-5">
          <button onClick={() => void signOut()} className="btn-secondary text-sm">Sign out</button>
        </section>
      </div>
    </CreatorShell>
  );
}
