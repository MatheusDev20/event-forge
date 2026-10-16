'use client';

import { Button } from '@repo/ui/button';
import { useRouter } from 'next/navigation';
import { useConsoleSession, useLogout } from '../lib/session';

/**
 * Who is signed in, for which organizer, and the way out.
 *
 * Logging out navigates even if the request fails. The user asked to leave,
 * and a console that keeps them "signed in" because the API was unreachable
 * would be refusing for a reason they cannot fix.
 */
export function AccountMenu() {
  const { account, organizer } = useConsoleSession();
  const logout = useLogout();
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <div className="hidden flex-col items-end leading-tight sm:flex">
        <span className="text-text text-sm font-medium">{account.name}</span>
        <span className="text-text-muted text-xs">{organizer.name}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        isLoading={logout.isPending}
        onClick={() =>
          logout.mutate(undefined, {
            onSettled: () => router.replace('/login'),
          })
        }
      >
        Log out
      </Button>
    </div>
  );
}
