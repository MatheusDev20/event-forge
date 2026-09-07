import { Marked } from 'marked';

/*
 * The write-ups are files this repository owns, so the markdown is trusted and
 * rendered to HTML at build time. If the site ever renders markdown from
 * somewhere else, sanitize it here first.
 */
const marked = new Marked({ gfm: true });

export function renderMarkdown(body: string): string {
  return marked.parse(body, { async: false });
}

/**
 * The page shows the title in its own header, so the write-up's leading `#`
 * heading is dropped to avoid printing it twice.
 */
export function stripLeadingHeading(body: string): string {
  return body.replace(/^#\s+.+\n+/, '');
}
