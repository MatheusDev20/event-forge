import Link from 'next/link';
import { getExperiments } from '@/lib/experiments';
import { StatusBadge } from './components/status-badge';

export default function HomePage() {
  const experiments = getExperiments();

  return (
    <>
      <section className="mb-12">
        <h1 className="text-2xl font-semibold">Experiments</h1>
        <p className="mt-3 text-neutral-600">
          Event Forge is a ticketing platform I built to have something real to
          break. Each experiment here asks one question about how it behaves
          under load — contention, races, migrations — and answers it with a test
          rather than an opinion.
        </p>
      </section>

      {experiments.length === 0 ? (
        <p className="text-neutral-500">No experiments published yet.</p>
      ) : (
        <ul className="space-y-6">
          {experiments.map((experiment) => (
            <li key={experiment.slug}>
              <div className="flex items-center gap-3">
                <Link
                  href={`/experiments/${experiment.slug}`}
                  className="font-medium underline underline-offset-4"
                >
                  {experiment.title}
                </Link>
                <StatusBadge status={experiment.status} />
              </div>
              {experiment.question && (
                <p className="mt-1 text-sm text-neutral-600">
                  {experiment.question}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
