import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getExperiment, getExperiments } from '@/lib/experiments';
import { stripLeadingHeading } from '@/lib/markdown';
import { Prose } from '@/app/components/prose';
import { StatusBadge } from '@/app/components/status-badge';

/* Every page is enumerated below, so an unknown slug is a 404 served from the
 * static build rather than a filesystem read at request time. */
export const dynamicParams = false;

export function generateStaticParams() {
  return getExperiments().map((experiment) => ({ slug: experiment.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const experiment = getExperiment(slug);
  if (!experiment) return {};
  return {
    title: experiment.title,
    description: experiment.question ?? undefined,
  };
}

export default async function ExperimentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const experiment = getExperiment(slug);
  if (!experiment) notFound();

  return (
    <article>
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{experiment.title}</h1>
          <StatusBadge status={experiment.status} />
        </div>
      </header>

      <Prose body={stripLeadingHeading(experiment.main.body)} />

      {experiment.extras.length > 0 && (
        <nav className="mt-12 border-t border-neutral-200 pt-6">
          <h2 className="text-sm font-medium text-neutral-500">Also in this experiment</h2>
          <ul className="mt-3 space-y-1">
            {experiment.extras.map((doc) => (
              <li key={doc.slug}>
                <Link
                  href={`/experiments/${experiment.slug}/${doc.slug}`}
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
