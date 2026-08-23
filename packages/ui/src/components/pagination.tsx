'use client';

import { cn } from '../lib/cn';
import { Button } from './button';

export type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Rendered next to the controls, e.g. "Showing 1–12 of 48". */
  summary?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Controlled and framework-agnostic on purpose: this package must not import
 * next/link. The consumer decides whether a page change is a router push, a
 * fetch, or local state.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  summary,
  className,
  disabled = false,
}: PaginationProps) {
  if (pageCount <= 1 && !summary) return null;

  const pages = pageWindow(page, pageCount);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-col-reverse items-center justify-between gap-4 sm:flex-row',
        className,
      )}
    >
      {summary ? (
        <p className="text-text-muted text-sm" aria-live="polite">
          {summary}
        </p>
      ) : (
        <span />
      )}

      {pageCount > 1 ? (
        <ul className="flex items-center gap-1">
          <li>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous page"
              disabled={disabled || page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <Chevron direction="left" />
            </Button>
          </li>

          {pages.map((entry, index) =>
            entry === 'ellipsis' ? (
              <li
                key={`ellipsis-${index}`}
                aria-hidden="true"
                className="text-text-subtle px-1 text-sm"
              >
                …
              </li>
            ) : (
              <li key={entry}>
                <Button
                  variant={entry === page ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-label={`Page ${entry}`}
                  aria-current={entry === page ? 'page' : undefined}
                  disabled={disabled}
                  onClick={() => onPageChange(entry)}
                >
                  {entry}
                </Button>
              </li>
            ),
          )}

          <li>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next page"
              disabled={disabled || page >= pageCount}
              onClick={() => onPageChange(page + 1)}
            >
              <Chevron direction="right" />
            </Button>
          </li>
        </ul>
      ) : null}
    </nav>
  );
}

/**
 * First and last page always visible, a window around the current page, and
 * ellipses for the gaps — so the control's width stays stable as pageCount
 * grows.
 */
function pageWindow(page: number, pageCount: number): (number | 'ellipsis')[] {
  const span = 1;
  const shown = new Set<number>([1, pageCount]);

  for (let p = page - span; p <= page + span; p++) {
    if (p >= 1 && p <= pageCount) shown.add(p);
  }

  const sorted = [...shown].sort((a, b) => a - b);
  const out: (number | 'ellipsis')[] = [];

  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous > 1) out.push('ellipsis');
    out.push(value);
  });

  return out;
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-4">
      <path
        d={direction === 'left' ? 'm10 3-5 5 5 5' : 'm6 3 5 5-5 5'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
