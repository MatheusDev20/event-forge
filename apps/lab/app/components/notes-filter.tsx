'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { Category } from '@/lib/articles';

/*
 * The filter is client state rather than a `?filter=` search param on purpose:
 * reading searchParams would opt the home page into request-time rendering,
 * and the whole list is known at build time. Only the fields the list renders
 * are passed in — the write-up bodies stay on the server.
 */
export type NoteSummary = {
  category: string;
  slug: string;
  title: string;
  question: string | null;
};

/* The category a `what is this` link hangs off. It is the only one with a
 * story that needs telling; the rest are self-explanatory. */
const EVENT_FORGE = 'event-forge';

export function NotesFilter({
  notes,
  categories,
}: {
  notes: NoteSummary[];
  categories: Category[];
}) {
  const [active, setActive] = useState<string>('all');
  const about = useRef<HTMLDialogElement>(null);
  const shown =
    active === 'all' ? notes : notes.filter((note) => note.category === active);

  /* `all` is not a folder, so it is prepended rather than read from disk. */
  const filters = [{ slug: 'all', label: 'all' }, ...categories];

  return (
    <>
      <div className="mt-7 flex flex-wrap gap-2">
        {filters.map((filter) => {
          const isActive = filter.slug === active;
          return (
            <button
              key={filter.slug}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActive(filter.slug)}
              className={`cursor-pointer rounded-[2px] border px-2 py-1 text-[11px] tracking-[0.06em] uppercase transition-colors ${
                isActive
                  ? 'border-[rgb(20,22,26)] bg-[rgb(20,22,26)] text-[rgb(251,251,249)]'
                  : 'border-neutral-300 text-[rgb(107,112,118)] hover:border-neutral-400 hover:text-[rgb(20,22,26)]'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {active === EVENT_FORGE && (
        <button
          type="button"
          onClick={() => about.current?.showModal()}
          className="mt-4 cursor-pointer border-b border-[rgb(43,108,176)] text-xs leading-none text-[rgb(43,108,176)] transition-opacity hover:opacity-70"
        >
          what is event-forge
        </button>
      )}

      {/*
       * Native <dialog> rather than a hand-rolled overlay: Esc to close, focus
       * containment and the backdrop all come from the platform. Padding lives
       * on the inner div so a click landing on the <dialog> itself is
       * unambiguously a backdrop click.
       */}
      <dialog
        ref={about}
        onClick={(event) => {
          if (event.target === about.current) about.current.close();
        }}
        className="m-auto max-w-lg rounded-[2px] border border-neutral-300 bg-[rgb(251,251,249)] p-0 text-[rgb(20,22,26)] backdrop:bg-[rgb(20,22,26)]/20"
      >
        <div className="p-6">
          <h2 className="text-sm font-semibold tracking-[-0.01em]">
            What is Event Forge?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[rgb(107,112,118)]">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
            ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
            aliquip ex ea commodo consequat.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[rgb(107,112,118)]">
            Duis aute irure dolor in reprehenderit in voluptate velit esse
            cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat
            cupidatat non proident, sunt in culpa qui officia deserunt mollit
            anim id est laborum.
          </p>
          <button
            type="button"
            onClick={() => about.current?.close()}
            className="mt-6 cursor-pointer rounded-[2px] border border-neutral-300 px-2 py-1 text-[11px] tracking-[0.06em] uppercase text-[rgb(107,112,118)] transition-colors hover:border-neutral-400 hover:text-[rgb(20,22,26)]"
          >
            close
          </button>
        </div>
      </dialog>

      {shown.length === 0 ? (
        <p className="mt-10 text-sm text-[rgb(107,112,118)]">
          {notes.length === 0
            ? 'Nothing published yet.'
            : 'Nothing filed under this one yet.'}
        </p>
      ) : (
        <ul className="mt-10 space-y-6">
          {shown.map((note) => (
            <li key={`${note.category}/${note.slug}`}>
              <Link
                href={`/articles/${note.category}/${note.slug}`}
                className="font-medium underline underline-offset-4"
              >
                {note.title}
              </Link>
              {note.question && (
                <p className="mt-1 text-sm text-neutral-600">{note.question}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
