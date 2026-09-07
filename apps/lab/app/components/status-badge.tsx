import type { ExperimentStatus } from '@/lib/experiments';

const labels: Record<ExperimentStatus, string> = {
  green: 'green',
  red: 'red',
  running: 'running',
  unknown: 'draft',
};

export function StatusBadge({ status }: { status: ExperimentStatus }) {
  return (
    <span className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600">
      {labels[status]}
    </span>
  );
}
