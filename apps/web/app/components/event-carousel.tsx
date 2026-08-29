'use client';

import type { EventSummary } from '@repo/contracts/catalog';
import { Button } from '@repo/ui/button';
import { cn } from '@repo/ui/cn';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  CATEGORY_ART_TINT,
  STATUS_LABEL,
  heroImageUrl,
} from '../lib/event-display';
import { formatEventDateTime, formatMoney } from '../lib/format';

const AUTOPLAY_MS = 7000;

export function EventCarousel({ events }: { events: EventSummary[] }) {
  const count = events.length;
  const [index, setIndex] = useState(0);
  /* The handoff stops the timer for good on the first manual move: someone
   * steering the carousel does not want it steering back. */
  const [isAutoplaying, setIsAutoplaying] = useState(true);
  /* Pointing at or tabbing into the carousel holds the current slide. Now that
   * the whole slide is a link, a rotation mid-reach sends the click to the
   * wrong event — and WCAG 2.2.2 wants auto-updating content pausable anyway. */
  const [isHeld, setIsHeld] = useState(false);

  const goTo = useCallback(
    (next: number) => {
      setIsAutoplaying(false);
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (!isAutoplaying || isHeld || count < 2) return;
    // Content that advances on its own is motion too, not just the transition.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = setInterval(
      () => setIndex((current) => (current + 1) % count),
      AUTOPLAY_MS,
    );
    return () => clearInterval(timer);
  }, [isAutoplaying, isHeld, count]);

  if (count === 0) return null;

  return (
    <section
      className="pb-18"
      aria-roledescription="carousel"
      aria-label="Featured events"
    >
      {/* Only a bottom border: the header already draws the hairline above. */}
      <div
        className="border-border-subtle bg-surface relative overflow-hidden border-b"
        onMouseEnter={() => setIsHeld(true)}
        onMouseLeave={() => setIsHeld(false)}
        /* Capture, because focus lands on a descendant — the CTA or a dot —
         * and focus/blur do not bubble. */
        onFocusCapture={() => setIsHeld(true)}
        onBlurCapture={() => setIsHeld(false)}
      >
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

        {/* z-20 puts both control clusters above each slide's stretched link,
            so stepping through the carousel never navigates away from it. */}
        <div className="absolute right-7 bottom-11 z-20 flex items-center gap-2.5">
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

        <div className="absolute right-7.5 bottom-5.5 z-20 flex items-center gap-2">
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
      className="group relative flex h-[460px] w-full shrink-0 basis-full cursor-pointer flex-col justify-end overflow-hidden"
      aria-roledescription="slide"
      aria-label={`${position}: ${event.title}`}
      inert={!isActive}
    >
      <SlideArtwork event={event} />
      {/* Weighted to the left so the headline block keeps its contrast while
       * the right of the artwork stays visible. Lifts a little on hover, which
       * is most of what makes the slide feel touchable. */}
      <div className="from-media-veil/94 via-media-veil/72 to-media-veil/18 ease-standard absolute inset-0 bg-linear-75 via-42% transition-opacity duration-500 group-hover:opacity-90" />

      {/*
       * `z-10` rather than `relative`, and the distinction is load-bearing: the
       * CTA below stretches its ::after across the whole slide, and a
       * positioned ancestor here would clip that overlay to this column
       * instead. A flex item takes a z-index without being positioned, so the
       * text still stacks above the veil.
       */}
      <div className="z-10 max-w-[720px] px-6 pt-6 pb-28 sm:px-9 lg:px-12 lg:pt-11 lg:pb-11">
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
          {/*
           * One anchor, stretched — not a link wrapping the slide. The slide
           * already contains this CTA, and nesting one <a> inside another is
           * invalid HTML that browsers un-nest in their own ways. An ::after
           * spanning the article gives the whole surface one click target and
           * keyboard users a single tab stop, and the controls sit above it on
           * z-20 so stepping still steps.
           *
           * The article is `inert` while off-screen, which keeps every hidden
           * slide's link out of the tab order.
           */}
          <Button
            asChild
            size="lg"
            className="font-display h-12.5 px-6.5 text-[15px] font-semibold shadow-none"
          >
            <Link
              href={`/events/${event.slug}`}
              aria-label={`Buy tickets for ${event.title}`}
              className="after:absolute after:inset-0 after:content-['']"
            >
              Buy tickets
            </Link>
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
 * Real artwork when the event has it, the shared stand-in when it does not —
 * the same `heroImageUrl()` the browse cards use, so one event does not appear
 * as a photograph in the grid and as a colour field here.
 *
 * The category tint sits behind the image rather than instead of it: if the
 * host is unreachable the slide still reads as a slide, not as a white gap.
 * The scale on hover is the second half of the affordance — slow and small
 * enough to register as depth rather than as animation.
 */
function SlideArtwork({ event }: { event: EventSummary }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ backgroundColor: CATEGORY_ART_TINT[event.category] }}
    >
      <SlideArtworkImage event={event} />
    </div>
  );
}

function SlideArtworkImage({ event }: { event: EventSummary }) {
  return (
    // Stand-in artwork comes from an external host, and no next/image remote
    // pattern is configured for it — see heroImageUrl(). Swap to <Image> in
    // the same change that settles the CDN origin.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={heroImageUrl(event)}
      alt=""
      className="ease-standard size-full object-cover transition-transform duration-[900ms] group-hover:scale-[1.04]"
    />
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
