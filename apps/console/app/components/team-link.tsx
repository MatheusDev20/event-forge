'use client';

import { Button } from '@repo/ui/button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConsoleSession } from '../lib/session';

/**
 * The way to the Team page, for admins of the current organizer only.
 *
 * In the header, beside the account, rather than in the sidebar: managing who
 * can sign in is something done about the workspace, not a section of work
 * inside it, and the sidebar is kept for the latter.
 */
export function TeamLink() {
  const { organizer } = useConsoleSession();
  const pathname = usePathname();

  if (organizer.role !== 'admin') return null;

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className={pathname === '/team' ? 'bg-action-ghost-hover' : undefined}
    >
      <Link
        href="/team"
        aria-label="Manage team"
        title="Manage team"
        aria-current={pathname === '/team' ? 'page' : undefined}
      >
        <TeamIcon />
      </Link>
    </Button>
  );
}

/** Two people — the conventional mark for "members". */
function TeamIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 19.5c0-3.1 2.7-5.5 6-5.5s6 2.4 6 5.5" />
      <path d="M15.5 4.9a3.25 3.25 0 0 1 0 6.2" />
      <path d="M17.5 14.3c2.1.7 3.5 2.6 3.5 5.2" />
    </svg>
  );
}
