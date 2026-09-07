/*
 * Placeholder switch: the lab is English-only for now, so neither button does
 * anything yet — this reserves the spot and the styling for when the write-ups
 * get a Portuguese cut.
 */
export function LanguageSwitch() {
  return (
    <span className="flex items-center gap-1 border-l border-neutral-300 pl-4 text-[11px] tracking-[0.06em] uppercase">
      <button
        type="button"
        aria-pressed={false}
        className="cursor-pointer text-[rgb(107,112,118)] hover:text-[rgb(20,22,26)]"
      >
        pt
      </button>
      <span aria-hidden className="text-neutral-300">
        /
      </span>
      <button
        type="button"
        aria-pressed={true}
        className="cursor-pointer text-[rgb(20,22,26)]"
      >
        en
      </button>
    </span>
  );
}
