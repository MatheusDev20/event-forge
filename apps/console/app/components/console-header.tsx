import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import Link from 'next/link';

/**
 * Unset is a legitimate state — a deployment that does not run the storefront
 * alongside the console — so the link is dropped rather than defaulted to a
 * localhost URL that would 404 for everyone but a developer.
 */
const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL;

/**
 * The console's top bar.
 *
 * Same wordmark treatment as the storefront's header, with "Console" appended
 * and the accent moved onto it: an organizer keeps both apps open, and the one
 * thing the bar has to answer at a glance is which of the two this tab is.
 *
 * No search. The storefront centres one because browsing is what a visitor
 * does; the equivalent here is a filtered list inside each section, and a
 * global search box with nothing to search would be furniture.
 */
export function ConsoleHeader() {
  return (
    <header className="bg-surface border-border-subtle sticky top-0 z-20 border-b">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-6 px-4 py-3 lg:h-19 lg:px-8 lg:py-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <span className="font-display text-text text-[23px] font-bold tracking-[-0.035em]">
              Event<span className="text-text-muted">Forge</span>{' '}
              <span className="text-text-brand">Console</span>
            </span>
          </Link>
          <Badge tone="warning" size="sm">
            Scaffold
          </Badge>
        </div>

        {STOREFRONT_URL ? (
          <Button
            asChild
            variant="secondary"
            className="font-display bg-transparent px-4.5 shadow-none
              hover:border-border-strong hover:bg-transparent active:bg-transparent"
          >
            {/*
             * A plain anchor, not next/link: the storefront is a separate app
             * on its own origin, and next/link would prefetch a route this one
             * does not have.
             */}
            <a href={STOREFRONT_URL} target="_blank" rel="noreferrer">
              View storefront
            </a>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
