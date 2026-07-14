import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import brandLogo from '@/assets/fyv-brand-logo.png';
import {
  sendPasswordResetEmail,
  signInWithGoogle,
  signInWithOtp,
  signInWithPassword,
} from '@/lib/supabase';
import { normalizeRedirectPath } from '@/lib/redirect';

type Mode = 'gate' | 'page';

function PasswordStrengthHint() {
  return (
    <p className="text-xs leading-5 text-charcoal-2">
      Use at least 12 characters with a mix of words, numbers, and symbols.
    </p>
  );
}

export function CreatorAuth({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<'password' | 'google' | 'magic' | 'reset' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestedPath = useMemo(() => {
    const current = `${window.location.pathname}${window.location.search}`;
    return normalizeRedirectPath(current.startsWith('/my') ? current : '/my', '/my');
  }, []);

  const clearStatus = () => {
    setMessage(null);
    setError(null);
  };

  const handlePasswordSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('password');
    clearStatus();
    const { error } = await signInWithPassword(email, password);
    if (error) {
      setError('We could not sign you in with those details. Please check your email and password.');
    } else {
      navigate(requestedPath, { replace: true });
    }
    setBusy(null);
  };

  const handleGoogleSignIn = async () => {
    setBusy('google');
    clearStatus();
    const { error } = await signInWithGoogle(requestedPath);
    if (error) {
      setError('Google sign-in is not available right now. Please try email instead.');
      setBusy(null);
      return;
    }
  };

  const handleMagicLink = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('magic');
    clearStatus();
    const { error } = await signInWithOtp(email, requestedPath);
    if (error) {
      setError('We could not send a magic link right now. Please check the email address and try again.');
    } else {
      setMessage('Magic link sent. Check your inbox to continue.');
    }
    setBusy(null);
  };

  const handleReset = async () => {
    setBusy('reset');
    clearStatus();
    const { error } = await sendPasswordResetEmail(email);
    if (error) {
      setError('We could not send a password reset email right now. Please try again.');
    } else {
      setMessage('Password reset email sent. Open the link to choose a new password.');
    }
    setBusy(null);
  };

  return (
    <div className="min-h-screen bg-surface-2 px-4 py-6 text-charcoal sm:px-6 lg:px-8">
      <main className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center">
        <section className="grid w-full gap-5 rounded-3xl border border-white/10 bg-surface/92 p-5 shadow-2xl shadow-black/25 backdrop-blur lg:grid-cols-[0.95fr_1.05fr] lg:p-6">
          <div className="flex flex-col justify-center">
            <img src={brandLogo} alt="Find Your Vertical" className="h-20 w-auto object-contain" />
            <h1 className="mt-5 max-w-xl text-3xl font-bold leading-tight text-charcoal">Welcome back</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-charcoal-2">
              Sign in with Google, email and password, or a magic link. If you were invited before passwords were enabled,
              you can set one after you sign in.
            </p>
          </div>

          <div className="grid gap-3">
            <button type="button" onClick={() => void handleGoogleSignIn()} disabled={busy === 'google'} className="btn-primary w-full">
              {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
            </button>

            <div className="rounded-2xl border border-white/10 bg-surface-3/70 p-4">
              <form onSubmit={handlePasswordSignIn} className="grid gap-3">
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    clearStatus();
                  }}
                  placeholder="Email address"
                  required
                  className="field-control w-full"
                />
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => {
                      setPassword(e.target.value);
                      clearStatus();
                    }}
                    placeholder="Password"
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
                <PasswordStrengthHint />
                <button type="submit" disabled={busy === 'password'} className="btn-primary w-full">
                  {busy === 'password' ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-white/10 bg-surface-3/70 p-4">
              <h2 className="text-base font-bold text-charcoal">Forgot password?</h2>
              <p className="mt-1 text-sm text-charcoal-2">
                We’ll send a reset link to the email on file and return you here to set a new password.
              </p>
              <button type="button" onClick={() => void handleReset()} disabled={busy === 'reset'} className="btn-secondary mt-3 w-full">
                {busy === 'reset' ? 'Sending…' : 'Email me a reset link'}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-surface-3/70 p-4">
              <h2 className="text-base font-bold text-charcoal">Email me magic link</h2>
              <form onSubmit={handleMagicLink} className="mt-3 grid gap-3">
                <button type="submit" disabled={busy === 'magic'} className="btn-secondary w-full">
                  {busy === 'magic' ? 'Sending…' : 'Email me magic link'}
                </button>
              </form>
            </div>

            {message && <p className="text-sm text-success" role="status">{message}</p>}
            {error && <p className="text-sm text-pink" role="alert">{error}</p>}

            {mode === 'page' && (
              <Link to="/my" className="text-center text-sm font-medium text-accent hover:underline">
                Back to My Vertical
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
