'use client';

import type {
  EventCategory,
  EventStatus,
  EventSummary,
} from '@repo/contracts/catalog';
import { Button } from '@repo/ui/button';
import { cn } from '@repo/ui/cn';
import { useCallback, useEffect, useState } from 'react';
import { formatEventDateTime, formatMoney } from '../lib/format';

const AUTOPLAY_MS = 7000;

/** Sale state, said the way a buyer reads it rather than the way we store it. */
const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Not yet announced',
  published: 'Coming soon',
  on_sale: 'On sale now',
  closed: 'Sales closed',
  cancelled: 'Cancelled',
};

/**
 * Fallback artwork tints, keyed by category so a given event always draws the
 * same one. These are not design tokens: they stand in for a photograph, and
 * they go away the day `heroImageUrl` is populated.
 */
const CATEGORY_ART_TINT: Record<EventCategory, string> = {
  music: '#1b3a8f',
  sports: '#0f4a5a',
  theatre: '#4a2a6b',
  conference: '#1f4a3c',
  comedy: '#6b3a1f',
  festival: '#5a2a4a',
};

export function EventCarousel({ events }: { events: EventSummary[] }) {
  const count = events.length;
  const [index, setIndex] = useState(0);
  /* The handoff stops the timer for good on the first manual move: someone
   * steering the carousel does not want it steering back. */
  const [isAutoplaying, setIsAutoplaying] = useState(true);

  const goTo = useCallback(
    (next: number) => {
      setIsAutoplaying(false);
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (!isAutoplaying || count < 2) return;
    // Content that advances on its own is motion too, not just the transition.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = setInterval(
      () => setIndex((current) => (current + 1) % count),
      AUTOPLAY_MS,
    );
    return () => clearInterval(timer);
  }, [isAutoplaying, count]);

  if (count === 0) return null;

  return (
    <section
      className="pb-18"
      aria-roledescription="carousel"
      aria-label="Featured events"
    >
      {/* Only a bottom border: the header already draws the hairline above. */}
      <div className="border-border-subtle bg-surface relative overflow-hidden border-b">
        <div
          className="flex transition-transform duration-[520ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]"
          style={{ transform: `translateX(-${index * 100}%)` }}
          aria-live={isAutoplaying ? 'off' : 'polite'}
        >
          {events.map((event, slide) => (
            <Slide
              key={event.id}
              event={event}
              position={`${slide + 1} of ${count}`}
              /* Off-screen slides keep their CTA out of the tab order; without
               * this every hidden slide's button is still reachable. */
              isActive={slide === index}
            />
          ))}
        </div>

        <div className="absolute right-7 bottom-11 flex items-center gap-2.5">
          <StepButton
            direction="previous"
            onClick={() => goTo(index - 1)}
            disabled={count < 2}
          />
          <StepButton
            direction="next"
            onClick={() => goTo(index + 1)}
            disabled={count < 2}
          />
        </div>

        <div className="absolute right-7.5 bottom-5.5 flex items-center gap-2">
          {events.map((event, slide) => (
            <button
              key={event.id}
              type="button"
              onClick={() => goTo(slide)}
              aria-label={event.title}
              aria-current={slide === index}
              className={cn(
                'h-1.5 rounded-full transition-[width,background-color] duration-300 ease-standard',
                slide === index
                  ? 'bg-on-media-accent w-6.5'
                  : 'bg-on-media/28 hover:bg-on-media/50 w-1.5',
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Slide({
  event,
  position,
  isActive,
}: {
  event: EventSummary;
  position: string;
  isActive: boolean;
}) {
  return (
    <article
      className="relative flex h-[460px] w-full shrink-0 basis-full flex-col justify-end"
      aria-roledescription="slide"
      aria-label={`${position}: ${event.title}`}
      inert={!isActive}
    >
      <SlideArtwork event={event} />
      {/* Weighted to the left so the headline block keeps its contrast while
       * the right of the artwork stays visible. */}
      <div className="from-media-veil/94 via-media-veil/72 to-media-veil/18 absolute inset-0 bg-linear-75 via-42%" />

      <div className="relative max-w-[720px] px-6 pt-6 pb-28 sm:px-9 lg:px-12 lg:pt-11 lg:pb-11">
        <div className="mb-4.5 flex items-center gap-2.5">
          <span className="font-display bg-action-primary text-action-primary-fg rounded-xs px-2.75 py-1.5 text-[11.5px] font-semibold tracking-[0.12em] uppercase">
            {event.category}
          </span>
          <span className="text-on-media-subtle text-[13.5px]">
            {STATUS_LABEL[event.status]}
          </span>
        </div>

        <h2 className="font-display text-on-media mb-3.5 text-[32px] leading-[1.02] font-bold tracking-[-0.04em] text-balance sm:text-[42px] lg:text-[52px]">
          {event.title}
        </h2>

        <div className="text-on-media-muted mb-7.5 flex flex-wrap items-center gap-x-4.5 gap-y-2 text-[15.5px]">
          <span>{formatEventDateTime(event.startsAt)}</span>
          <Dot />
          <span>{event.venue.name}</span>
          <Dot />
          <span>{event.venue.city}</span>
        </div>

        <div className="flex flex-wrap items-center gap-4.5">
          <Button
            size="lg"
            className="font-display h-12.5 px-6.5 text-[15px] font-semibold shadow-none"
            aria-label={`Buy tickets for ${event.title}`}
          >
            Buy tickets
          </Button>
          {event.priceFrom ? (
            <span className="text-on-media-subtle text-sm">
              From {formatMoney(event.priceFrom)}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Real artwork when we have it, a tinted stripe field when we don't. The
 * placeholder is labelled with the size the slot wants so it reads as a
 * missing asset rather than a design choice.
 */
function SlideArtwork({ event }: { event: EventSummary }) {
  if (event.heroImageUrl) {
    return (
      // Artwork hosts are not known yet, so next/image has no remote pattern
      // to allow. Swap to <Image> once the CDN origin is settled.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={event.heroImageUrl}
        alt=""
        className="absolute inset-0 size-full object-cover"
      />
    );
  }

  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(115deg, ${
            CATEGORY_ART_TINT[event.category]
          } 0 22px, var(--color-media-veil) 22px 44px)`,
        }}
      />
      <span className="text-on-media/40 bg-media-veil/35 absolute top-5.5 right-6 rounded-xs px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.1em] uppercase">
        event artwork 2400×920
      </span>
    </>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="bg-on-media/25 size-1 rounded-full" />
  );
}

function StepButton({
  direction,
  onClick,
  disabled,
}: {
  direction: 'previous' | 'next';
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${direction === 'next' ? 'Next' : 'Previous'} event`}
      className={cn(
        'grid size-11 place-items-center rounded-full border backdrop-blur-[6px]',
        'bg-media-veil/55 border-on-media/18 text-on-media',
        'transition-colors duration-150 ease-standard',
        'hover:bg-action-primary/90 hover:border-on-media-accent',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-media-veil/55',
      )}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline
          points={direction === 'next' ? '9 5 16 12 9 19' : '15 5 8 12 15 19'}
        />
      </svg>
    </button>
  );
}
