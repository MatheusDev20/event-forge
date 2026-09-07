import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getExperiment, getExperiments } from '@/lib/experiments';
import { stripLeadingHeading } from '@/lib/markdown';
import { Prose } from '@/app/components/prose';

/* Every page is enumerated below, so an unknown slug is a 404 served from the
 * static build rather than a filesystem read at request time. */
export const dynamicParams = false;

export function generateStaticParams() {
  return getExperiments().flatMap((experiment) =>
    experiment.extras.map((extra) => ({
      slug: experiment.slug,
      doc: extra.slug,
    })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; doc: string }>;
}) {
  const { slug, doc } = await params;
  const found = getExperiment(slug)?.extras.find((extra) => extra.slug === doc);
  return found ? { title: `${found.title} — ${getExperiment(slug)?.title}` } : {};
}

export default async function ExperimentDocPage({
  params,
}: {
  params: Promise<{ slug: string; doc: string }>;
}) {
  const { slug, doc } = await params;
  const experiment = getExperiment(slug);
  const found = experiment?.extras.find((extra) => extra.slug === doc);
  if (!experiment || !found) notFound();

  return (
    <article>
      <header className="mb-8">
        <Link
          href={`/experiments/${experiment.slug}`}
          className="text-sm text-neutral-500 underline underline-offset-4"
        >
          {experiment.title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{found.title}</h1>
      </header>

      <Prose body={stripLeadingHeading(found.body)} />
    </article>
  );
}
