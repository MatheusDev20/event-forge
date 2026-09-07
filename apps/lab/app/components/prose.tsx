import { renderMarkdown } from '@/lib/markdown';

/** Renders a write-up's markdown. The source is repo-owned, so it is trusted. */
export function Prose({ body }: { body: string }) {
  return (
    <div
      className="prose"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
    />
  );
}
