import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, updatePassword } from '@/lib/supabase';
import { PublicSiteShell } from '@/components/public/PublicSiteShell';

export function PasswordResetPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] ?? '' : '';
    const params = new URLSearchParams(window.location.search || hashQuery);
    const code = params.get('code');

    const completeRecovery = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (active) setError('We could not open the reset link. Please request a new one.');
          return;
        }
      }
      if (active) setReady(true);
    };

    void completeRecovery();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      setBusy(false);
      return;
    }
    const { error } = await updatePassword(password);
    if (error) {
      setError('We could not change your password right now. Please sign in again and try once more.');
    } else {
      setMessage('Your password has been updated.');
      window.setTimeout(() => navigate('/my', { replace: true }), 800);
    }
    setBusy(false);
  };

  return (
    <PublicSiteShell eyebrow="Account security" title="Set a new password" description="Choose a secure password for your creator account." heroTitle="A fresh start" heroDescription="Secure your account, then get straight back to your creator journey.">
      <div>
        {!ready ? (
          <p className="mt-4 text-sm text-charcoal-2" role="status">Preparing your reset link…</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="New password"
                required
                className="field-control w-full pr-24"
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute inset-y-0 right-2 my-auto h-8 rounded-full border border-white/10 px-3 text-xs font-semibold text-charcoal-2"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Confirm password"
              required
              className="field-control w-full"
            />
            <p className="text-xs leading-5 text-charcoal-2">Use at least 12 characters with a mix of words, numbers, and symbols.</p>
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : 'Save password'}
            </button>
          </form>
        )}
        {message && <p className="mt-3 text-sm text-success" role="status">{message}</p>}
        {error && <p className="mt-3 text-sm text-pink" role="alert">{error}</p>}
      </div>
    </PublicSiteShell>
  );
}
