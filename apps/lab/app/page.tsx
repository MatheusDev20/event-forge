import { getExperiments } from '@/lib/experiments';
import { NotesFilter, type NoteSummary } from './components/notes-filter';

export default function HomePage() {
  /*
   * Everything the site reads today comes out of the monorepo's `experiments/`
   * folder, so it all files under EventForge. `kind` exists so a second source
   * of write-ups can land under Programming without touching the filter.
   */
  const notes: NoteSummary[] = getExperiments().map((experiment) => ({
    slug: experiment.slug,
    title: experiment.title,
    question: experiment.question,
    status: experiment.status,
    kind: 'eventforge',
  }));

  return (
    <section>
      {/* `font-sans` resolves to IBM Plex Sans — see the theme block in
          app/styles/global.css. Everything outside this block stays mono. */}
      <div className="font-sans">
        <h1 className="max-w-2xl text-xl leading-relaxed text-[rgb(20,22,26)]">
          This is where I put the stuff I write.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[rgb(107,112,118)]">
          You can browse it with the filter below, though most of the time a
          link will drop you straight into a single article.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[rgb(107,112,118)]">
          The texts cover different subjects, and their only real purpose is to
          help me get a proper grasp of whatever I am studying, reading or
          curious about. Hopefully some of it is useful to you as well. Or not.
        </p>
      </div>

      <NotesFilter notes={notes} />
    </section>
  );
}
