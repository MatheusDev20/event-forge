import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

/*
 * The write-ups are the source of truth and they live in the monorepo's
 * `experiments/` folder — this site only reads them, at build time, so there is
 * never a second copy to keep in sync. EXPERIMENTS_DIR exists so the app can be
 * pointed at a different folder once it is split into its own repository.
 */
const EXPERIMENTS_DIR = path.resolve(
  /* turbopackIgnore: true */
  process.cwd(),
  process.env.EXPERIMENTS_DIR ?? '../../experiments',
);

export type ExperimentStatus = 'green' | 'red' | 'running' | 'unknown';

/** A markdown file inside an experiment folder. */
export type Doc = {
  /** Slug of the file, e.g. `takeaways`. */
  slug: string;
  title: string;
  /** Raw markdown, front matter stripped. */
  body: string;
};

export type Experiment = {
  /** Folder name, e.g. `one-seat-experiment`. */
  slug: string;
  title: string;
  /** One-line framing of what the experiment asks. */
  question: string | null;
  status: ExperimentStatus;
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
 * The first blockquote — the write-ups open with a `>` paragraph stating the
 * question the experiment is meant to answer.
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

/** `Status: **green**` in the body, unless front matter says otherwise. */
function readStatus(data: Record<string, unknown>, body: string): ExperimentStatus {
  const raw =
    (typeof data.status === 'string' ? data.status : null) ??
    body.match(/^Status:\s*\**(\w+)\**/m)?.[1] ??
    '';

  const status = raw.toLowerCase();
  return status === 'green' || status === 'red' || status === 'running'
    ? status
    : 'unknown';
}

function titleize(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

function loadExperiment(slug: string): Experiment | null {
  const dir = path.join(EXPERIMENTS_DIR, slug);
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
    slug,
    title: main.title,
    question:
      (typeof data.question === 'string' ? data.question : null) ??
      leadQuote(main.body),
    status: readStatus(data, main.body),
    main,
    extras: files
      .filter((file) => file !== mainFile)
      .map((file) => toDoc(dir, file)),
  };
}

/** Every experiment folder, alphabetically. */
export function getExperiments(): Experiment[] {
  if (!fs.existsSync(EXPERIMENTS_DIR)) return [];

  return fs
    .readdirSync(EXPERIMENTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadExperiment(entry.name))
    .filter((experiment): experiment is Experiment => experiment !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getExperiment(slug: string): Experiment | null {
  const dir = path.join(EXPERIMENTS_DIR, slug);
  // Guard against a slug escaping the content directory.
  if (path.dirname(dir) !== EXPERIMENTS_DIR || !fs.existsSync(dir)) return null;
  return loadExperiment(slug);
}
