import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export type EmptyStateProps = ComponentProps<'div'> & {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-border bg-surface flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          className="text-text-subtle bg-surface-sunken flex size-11 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-text text-base font-semibold">{title}</p>
        {description ? (
          <p className="text-text-muted mx-auto max-w-prose text-sm text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
