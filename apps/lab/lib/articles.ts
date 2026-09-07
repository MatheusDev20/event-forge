import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

/*
 * The write-ups live inside this app, under `articles/`, so the site carries
 * its own content and splitting it into a public repository stays a matter of
 * copying one folder. ARTICLES_DIR exists so the loader can be pointed
 * somewhere else if that ever changes.
 *
 *   articles/
 *     event-forge/                     <- a category; drives the home filter
 *       one-seat-experiment/           <- an article
 *         one-seat-experiment.md       <- the main write-up
 *         takeaways.md                 <- a sub-page
 *     programming/
 */
const ARTICLES_DIR = path.resolve(
  /* turbopackIgnore: true */
  process.cwd(),
  process.env.ARTICLES_DIR ?? './articles',
);

/** A markdown file inside an article folder. */
export type Doc = {
  /** Slug of the file, e.g. `takeaways`. */
  slug: string;
  title: string;
  /** Raw markdown, front matter stripped. */
  body: string;
};

/** A top-level folder under `articles/`. One per filter on the home page. */
export type Category = {
  /** Folder name, e.g. `event-forge`. */
  slug: string;
  /** Display name, e.g. `Event Forge`. */
  label: string;
};

export type Article = {
  /** Category folder the article sits in, e.g. `event-forge`. */
  category: string;
  /** Folder name, e.g. `one-seat-experiment`. */
  slug: string;
  title: string;
  /** One-line framing of what the article asks. */
  question: string | null;
  /** The main write-up: `<slug>.md`, or `index.md`, or the only file present. */
  main: Doc;
  /** Every other markdown file in the folder, e.g. `takeaways`. */
  extras: Doc[];
};

function readMarkdown(file: string): { data: Record<string, unknown>; body: string } {
  const parsed = matter(fs.readFileSync(file, 'utf8'));
  return { data: parsed.data as Record<string, unknown>, body: parsed.content };
}

/** First `# heading` in the body, which is where these write-ups put the title. */
function firstHeading(body: string): string | null {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
}

/**
 * The first blockquote — the lab write-ups open with a `>` paragraph stating
 * the question the experiment is meant to answer.
 */
function leadQuote(body: string): string | null {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => line.startsWith('> '));
  if (start === -1) return null;

  const quote: string[] = [];
  for (let i = start; i < lines.length && lines[i].startsWith('>'); i++) {
    quote.push(lines[i].replace(/^>\s?/, ''));
  }
  return quote.join(' ').replace(/\s+/g, ' ').replace(/\*\*/g, '').trim() || null;
}

function titleize(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Directory entries of `dir`, or none if it does not exist. */
function subdirectories(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function toDoc(dir: string, file: string): Doc {
  const slug = file.replace(/\.md$/, '');
  const { data, body } = readMarkdown(path.join(dir, file));
  const title =
    (typeof data.title === 'string' ? data.title : null) ??
    firstHeading(body) ??
    titleize(slug);
  return { slug, title, body };
}

function loadArticle(category: string, slug: string): Article | null {
  const dir = path.join(ARTICLES_DIR, category, slug);
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .sort();
  if (files.length === 0) return null;

  const mainFile =
    files.find((file) => file === `${slug}.md`) ??
    files.find((file) => file === 'index.md') ??
    files[0];

  const main = toDoc(dir, mainFile);
  const { data } = readMarkdown(path.join(dir, mainFile));

  return {
    category,
    slug,
    title: main.title,
    question:
      (typeof data.question === 'string' ? data.question : null) ??
      leadQuote(main.body),
    main,
    extras: files
      .filter((file) => file !== mainFile)
      .map((file) => toDoc(dir, file)),
  };
}

/**
 * Every category folder, alphabetically. The home page builds its filter from
 * this, so adding a folder under `articles/` is all it takes to add a filter.
 */
export function getCategories(): Category[] {
  return subdirectories(ARTICLES_DIR).map((slug) => ({
    slug,
    label: titleize(slug),
  }));
}

/** Every article in every category, alphabetically within each category. */
export function getArticles(): Article[] {
  return getCategories().flatMap((category) =>
    subdirectories(path.join(ARTICLES_DIR, category.slug))
      .map((slug) => loadArticle(category.slug, slug))
      .filter((article): article is Article => article !== null),
  );
}

export function getArticle(category: string, slug: string): Article | null {
  const dir = path.join(ARTICLES_DIR, category, slug);
  // Guard against a segment escaping the content directory.
  if (
    path.dirname(dir) !== path.join(ARTICLES_DIR, category) ||
    path.dirname(path.join(ARTICLES_DIR, category)) !== ARTICLES_DIR ||
    !fs.existsSync(dir)
  ) {
    return null;
  }
  return loadArticle(category, slug);
}
