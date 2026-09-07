import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticle, getArticles } from '@/lib/articles';
import { stripLeadingHeading } from '@/lib/markdown';
import { Prose } from '@/app/components/prose';

/* Every page is enumerated below, so an unknown slug is a 404 served from the
 * static build rather than a filesystem read at request time. */
export const dynamicParams = false;

export function generateStaticParams() {
  return getArticles().map((article) => ({
    category: article.category,
    slug: article.slug,
  }));
}

export async function generateMetadata({
  params,
}: PageProps<'/articles/[category]/[slug]'>) {
  const { category, slug } = await params;
  const article = getArticle(category, slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.question ?? undefined,
  };
}

export default async function ArticlePage({
  params,
}: PageProps<'/articles/[category]/[slug]'>) {
  const { category, slug } = await params;
  const article = getArticle(category, slug);
  if (!article) notFound();

  return (
    <article>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{article.title}</h1>
      </header>

      <Prose body={stripLeadingHeading(article.main.body)} />

      {article.extras.length > 0 && (
        <nav className="mt-12 border-t border-neutral-200 pt-6">
          <h2 className="text-sm font-medium text-neutral-500">
            Also in this article
          </h2>
          <ul className="mt-3 space-y-1">
            {article.extras.map((doc) => (
              <li key={doc.slug}>
                <Link
                  href={`/articles/${article.category}/${article.slug}/${doc.slug}`}
                  className="underline underline-offset-4"
                >
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </article>
  );
}
