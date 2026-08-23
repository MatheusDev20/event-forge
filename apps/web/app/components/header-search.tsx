'use client';

import { Button } from '@repo/ui/button';
import { cn } from '@repo/ui/cn';
import { Input } from '@repo/ui/input';
import { useState, type FormEvent } from 'react';

/**
 * The header's search pill.
 *
 * Client-side because the field is controlled, which is what the rest of
 * search will need (recent queries, suggestion popover). Submitting does
 * nothing yet — there is no results route to send anyone to.
 */
export function HeaderSearch({ className }: { className?: string }) {
  const [query, setQuery] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // TODO: route to /search?q= once the results page exists.
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn(className)}>
      <Input
        type="search"
        name="q"
        size="lg"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search events, artists, venues or cities"
        aria-label="Search events, artists, venues or cities"
        leadingIcon={<SearchIcon />}
        trailingSlot={
          <Button
            type="submit"
            size="sm"
            className="font-display rounded-full px-4.5 text-[13.5px] font-semibold shadow-none"
          >
            Search
          </Button>
        }
        containerClassName="h-11.5 gap-2.5 rounded-full bg-surface-sunken pl-4 pr-2"
        className="text-[15px] tracking-[-0.01em]"
      />
    </form>
  );
}

function SearchIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}
