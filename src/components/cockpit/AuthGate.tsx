import { useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase, signInWithOtp } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSent(false);
    setErrorMessage(null);

    const { error } = await signInWithOtp(email, `${location.pathname}${location.search}`);

    if (error) {
      setErrorMessage(error.message);
    } else {
      setSent(true);
    }

    setSending(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-pulse text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-display font-bold text-center mb-2">Creators Cockpit</h1>
          <p className="text-gray-500 text-center mb-8 text-sm">Agency access - sign in with email</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setSent(false);
                setErrorMessage(null);
              }}
              placeholder="you@agency.com"
              required
              className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent transition-colors"
            />
            <button
              type="submit"
              disabled={sending}
              className="w-full bg-accent hover:bg-accent-2 text-gray-950 font-semibold rounded-lg px-4 py-3 transition-colors disabled:opacity-50"
            >
              {sending ? 'Sending...' : sent ? 'Send again' : 'Send magic link'}
            </button>
          </form>
          {errorMessage && (
            <p className="text-sm text-red-300 text-center mt-4" role="alert">
              {errorMessage}
            </p>
          )}
          {sent && (
            <p className="text-sm text-gray-400 text-center mt-4">
              Magic link sent! Check your inbox.
            </p>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
