import { ConsoleHeader } from '../components/console-header';
import { ConsoleNav } from '../components/console-nav';
import { SessionGate } from '../components/session-gate';

/**
 * Sidebar and content, rather than the storefront's single centred column.
 *
 * The two apps are the same system and share every token, but they are not the
 * same shape: a visitor arrives to browse one thing, an organizer arrives to
 * move between standing sections. The sidebar collapses above the content
 * below `md`, where a persistent rail costs more width than it earns.
 *
 * Everything here waits on SessionGate: no header, no nav, no page until the
 * API has said who is signed in and which organizer they act for.
 */
export default function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionGate>
      <ConsoleHeader />
      <div className="mx-auto flex max-w-[90rem] flex-col gap-8 px-4 py-6 md:flex-row md:px-8 md:py-8">
        <ConsoleNav className="w-full shrink-0 md:sticky md:top-25 md:w-60 md:self-start" />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </SessionGate>
  );
}
