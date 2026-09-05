'use client';

import { Badge } from '@repo/ui/badge';
import { cn } from '@repo/ui/cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * One nav entry. `href` is what separates a section that exists from one that
 * does not — an item without it renders as a label, not a link.
 *
 * Listing the unbuilt sections is deliberate. The console's shape is decided
 * (docs/roadmap.md, Slice 5) and a sidebar that grows an item at a time hides
 * that; a greyed row says "this is coming and it goes here", which a dead link
 * would say by 404ing instead.
 */
type NavItem = {
  label: string;
  description: string;
  href?: string;
};

const NAV: NavItem[] = [
  {
    label: 'Overview',
    description: 'What this console is for',
    href: '/',
  },
  {
    label: 'Events',
    description: 'Create a draft, price it, publish, open sales',
  },
  {
    label: 'Venues',
    description: 'Rooms and the seat maps they are sold in',
  },
  {
    label: 'Holds',
    description: 'Live claims against an on-sale event',
  },
];

export function ConsoleNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn('flex flex-col gap-1', className)} aria-label="Sections">
      {NAV.map((item) =>
        item.href ? (
          <Link
            key={item.label}
            href={item.href}
            aria-current={pathname === item.href ? 'page' : undefined}
            className={cn(
              'ease-standard rounded-md px-3 py-2 transition-colors duration-150',
              'hover:bg-action-ghost-hover',
              pathname === item.href
                ? 'bg-brand-bg text-brand-fg hover:bg-brand-bg'
                : 'text-text',
            )}
          >
            <span className="font-display block text-sm font-medium">
              {item.label}
            </span>
            <span className="text-text-muted mt-0.5 block text-xs">
              {item.description}
            </span>
          </Link>
        ) : (
          <div
            key={item.label}
            className="rounded-md px-3 py-2 select-none"
            /*
             * Not a <button disabled> and not an <a> without href: there is
             * nothing here to activate, so the accessible tree should show
             * text. `aria-disabled` on a non-interactive node would announce a
             * control that does not exist.
             */
          >
            <span className="flex items-center gap-2">
              <span className="font-display text-text-subtle block text-sm font-medium">
                {item.label}
              </span>
              <Badge size="sm">Soon</Badge>
            </span>
            <span className="text-text-subtle mt-0.5 block text-xs">
              {item.description}
            </span>
          </div>
        ),
      )}
    </nav>
  );
}
