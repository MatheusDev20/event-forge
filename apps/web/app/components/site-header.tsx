import { Button } from '@repo/ui/button';
import Link from 'next/link';
import { HeaderSearch } from './header-search';

/**
 * The global header: wordmark, search, account actions.
 *
 * The handoff draws one 76px row on a three-column grid with the search
 * centred, which only holds while the two outer columns have room. Below `lg`
 * the search drops to its own row and the bar becomes wordmark / actions.
 */
export function SiteHeader() {
  return (
    <header className="bg-surface border-border-subtle sticky top-0 z-20 border-b">
      <div className="mx-auto grid max-w-[90rem] grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 px-4 py-3 lg:h-19 lg:grid-cols-[1fr_minmax(280px,620px)_1fr] lg:gap-8 lg:px-8 lg:py-0">
        <Link href="/" className="justify-self-start">
          <span className="font-display text-text text-[23px] font-bold tracking-[-0.035em]">
            Event<span className="text-text-brand">Forge</span>
          </span>
        </Link>

        <HeaderSearch className="order-last col-span-2 lg:order-none lg:col-span-1" />

        <div className="flex items-center gap-2.5 justify-self-end">
          <Button
            variant="secondary"
            className="font-display bg-transparent px-4.5 shadow-none
              hover:border-border-strong hover:bg-transparent active:bg-transparent"
          >
            Sign in
          </Button>
          <Button className="font-display px-5 font-semibold shadow-none">
            Sign up
          </Button>
        </div>
      </div>
    </header>
  );
}
