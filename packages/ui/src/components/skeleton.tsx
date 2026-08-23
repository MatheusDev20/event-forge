import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * Loading placeholder. Always give it a size via className — the component
 * has no opinion about how big the thing it stands in for is.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-surface-sunken animate-pulse rounded-md', className)}
      {...props}
    />
  );
}
