import { getArticles, getCategories } from '@/lib/articles';
import { NotesFilter, type NoteSummary } from './components/notes-filter';

export default function HomePage() {
  /*
   * Both the list and the filter come out of `articles/`: one chip per folder
   * in there, so a new category is a new folder and nothing else.
   */
  const notes: NoteSummary[] = getArticles().map((article) => ({
    category: article.category,
    slug: article.slug,
    title: article.title,
    question: article.question,
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

      <NotesFilter notes={notes} categories={getCategories()} />
    </section>
  );
}
