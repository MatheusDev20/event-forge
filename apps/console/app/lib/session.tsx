'use client';

import {
  listMyOrganizersResponseSchema,
  type MemberOrganizer,
} from '@repo/contracts/catalog';
import {
  sessionResponseSchema,
  type Account,
  type LoginRequest,
} from '@repo/contracts/identity';
import { ERROR_CODES } from '@repo/contracts/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import {
  apiGet,
  apiPost,
  apiPostNoContent,
  ApiRequestError,
} from './api/client';

/**
 * Who is signed in, and for which organizer they are acting.
 *
 * The server is the only authority on both. Nothing here is persisted in the
 * browser: the session lives in an httpOnly cookie this code cannot read, and
 * "am I signed in?" is answered by asking `GET /auth/me`. A 401 from it is the
 * one and only signal that the answer is no.
 *
 * There is no signup. Accounts are provided by an organizer's admins (see
 * lib/team.ts),
 * so the only way into a session from here is logging in.
 */

const ME_KEY = ['auth', 'me'] as const;
const ORGANIZERS_KEY = ['organizers', 'mine'] as const;

export function isUnauthenticated(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.code === ERROR_CODES.UNAUTHENTICATED
  );
}

/** A 401 is an answer, not a flake: retrying it only delays the login page. */
const retryUnlessSignedOut = (count: number, error: Error) =>
  !isUnauthenticated(error) && count < 2;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => apiGet('/auth/me', sessionResponseSchema),
    retry: retryUnlessSignedOut,
    staleTime: Infinity,
  });
}

export function useMyOrganizers({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: ORGANIZERS_KEY,
    queryFn: () => apiGet('/organizers', listMyOrganizersResponseSchema),
    enabled,
    retry: retryUnlessSignedOut,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LoginRequest) =>
      apiPost('/auth/login', sessionResponseSchema, body),
    onSuccess: (session) => {
      // Whatever a previous account left cached is not this account's.
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPostNoContent('/auth/logout'),
    onSettled: () => queryClient.clear(),
  });
}

/* ------------------------------------------------------------------ *
 * The signed-in context, for everything inside the console shell
 * ------------------------------------------------------------------ */

export type ConsoleSession = {
  account: Account;
  /**
   * The organizer the console is acting for — the first membership, until an
   * organizer switcher exists. Never null: an account with no organizer is
   * stopped at the gate. `organizer.role` is what decides whether the Team
   * page is theirs to see.
   */
  organizer: MemberOrganizer;
};

const SessionContext = createContext<ConsoleSession | null>(null);

export const SessionProvider = SessionContext.Provider;

/**
 * The account and organizer, in any component under the console shell.
 *
 * Throws outside it rather than returning null: every screen in the shell is
 * rendered only once the session is known (see SessionGate), so a null here
 * would be a component mounted somewhere it was never meant to be.
 */
export function useConsoleSession(): ConsoleSession {
  const session = useContext(SessionContext);

  if (!session) {
    throw new Error('useConsoleSession() used outside the console shell');
  }

  return session;
}

/**
 * Where to go after logging in. Only same-origin paths: a `next` of
 * `https://evil.example` or `//evil.example` would turn the login page into an
 * open redirect that carries this console's trust.
 */
export function safeNextPath(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
