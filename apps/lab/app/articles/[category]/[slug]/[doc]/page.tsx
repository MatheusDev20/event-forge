import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticle, getArticles } from '@/lib/articles';
import { stripLeadingHeading } from '@/lib/markdown';
import { Prose } from '@/app/components/prose';

/* Every page is enumerated below, so an unknown slug is a 404 served from the
 * static build rather than a filesystem read at request time. */
export const dynamicParams = false;

export function generateStaticParams() {
  return getArticles().flatMap((article) =>
    article.extras.map((extra) => ({
      category: article.category,
      slug: article.slug,
      doc: extra.slug,
    })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<'/articles/[category]/[slug]/[doc]'>) {
  const { category, slug, doc } = await params;
  const article = getArticle(category, slug);
  const found = article?.extras.find((extra) => extra.slug === doc);
  return found ? { title: `${found.title} — ${article!.title}` } : {};
}

export default async function ArticleDocPage({
  params,
}: PageProps<'/articles/[category]/[slug]/[doc]'>) {
  const { category, slug, doc } = await params;
  const article = getArticle(category, slug);
  const found = article?.extras.find((extra) => extra.slug === doc);
  if (!article || !found) notFound();

  return (
    <article>
      <header className="mb-8">
        <Link
          href={`/articles/${article.category}/${article.slug}`}
          className="text-sm text-neutral-500 underline underline-offset-4"
        >
          {article.title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{found.title}</h1>
      </header>

      <Prose body={stripLeadingHeading(found.body)} />
    </article>
  );
}
