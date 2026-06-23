import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase, signInWithOtp } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

type AuthMessageKind = 'success' | 'error';
const MAGIC_LINK_SUCCESS_MESSAGE = 'Magic link sent. Check your inbox.';
const LOGIN_ERROR_MESSAGE = 'Unable to send a magic link. Check the email address or contact the site owner for access.';

export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<AuthMessageKind | null>(null);

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

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    setMessageKind(null);

    const { error } = await signInWithOtp(email, `${location.pathname}${location.search}`);

    if (error) {
      setMessage(LOGIN_ERROR_MESSAGE);
      setMessageKind('error');
    } else {
      setMessage(MAGIC_LINK_SUCCESS_MESSAGE);
      setMessageKind('success');
    }

    setSending(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-500">Loading…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-accent">Find Your Vertical</p>
          <h1 className="mt-3 text-2xl font-display font-bold text-center text-gray-900">Creators Cockpit</h1>
          <p className="text-gray-500 text-center mb-8 mt-2 text-sm">Agency access - sign in with email</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              name="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setMessage(null);
                setMessageKind(null);
              }}
              placeholder="you@agency.com"
              required
              className="w-full bg-surface-2 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 transition-colors"
            />
            <button
              type="submit"
              disabled={sending}
              className="w-full bg-accent hover:bg-accent-2 text-white font-semibold rounded-lg px-4 py-3 transition-colors disabled:opacity-50"
            >
              {sending ? 'Sending…' : messageKind === 'success' ? 'Send Again' : 'Send Magic Link'}
            </button>
          </form>
          {message && (
            <p
              className={`text-sm text-center mt-4 ${
                messageKind === 'error' ? 'text-red-700' : 'text-gray-600'
              }`}
              role={messageKind === 'error' ? 'alert' : 'status'}
            >
              {message}
            </p>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}



