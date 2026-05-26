// Phase J.1 useSession — mount-time fetch /auth/me + watch wallet account
// changes (re-fetch when the user switches accounts in MetaMask).
//
// This is a tiny hook with no global store — every consumer mounts its own
// fetch. /auth/me returns 401 fast when unauthenticated, so the cost is bounded.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchSession, signIn, signOut, type SessionInfo } from '@/lib/session';
import { onWalletChange } from '@/lib/wallet/metamask';

export interface SessionState {
  session: SessionInfo | null;
  loading: boolean;
  err: string | null;
  /** Trigger the EIP-712 sign-in flow. Resolves with the new session. */
  doSignIn: () => Promise<void>;
  /** Revoke + clear cookie. Resolves once the server has been notified. */
  doSignOut: () => Promise<void>;
  /** Manually re-fetch /auth/me. */
  refresh: () => Promise<void>;
}

export function useSession(): SessionState {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const s = await fetchSession();
      setSession(s);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    // Re-fetch when the user switches accounts or chain — the server-side
    // session might still be valid but the user almost certainly wants to
    // sign in fresh.
    const unsub = onWalletChange(
      () => void refresh(),
      () => void refresh(),
    );
    return unsub;
  }, [refresh]);

  const doSignIn = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const s = await signIn();
      setSession(s);
    } catch (e) {
      setErr((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const doSignOut = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      await signOut();
      setSession(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { session, loading, err, doSignIn, doSignOut, refresh };
}
