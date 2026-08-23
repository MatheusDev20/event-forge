import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-sunken text-text-muted border-border',
        brand: 'bg-brand-bg text-brand-fg border-brand-border',
        success: 'bg-success-bg text-success-fg border-success-border',
        warning: 'bg-warning-bg text-warning-fg border-warning-border',
        danger: 'bg-danger-bg text-danger-fg border-danger-border',
        info: 'bg-info-bg text-info-fg border-info-border',
      },
      size: {
        sm: 'h-5 px-2 text-2xs',
        md: 'h-6 px-2.5 text-xs',
      },
    },
    defaultVariants: {
      tone: 'neutral',
      size: 'md',
    },
  },
);

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badge>;

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone, size }), className)} {...props} />;
}

/** A filled dot, for pairing a badge with a status colour. */
export function BadgeDot({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-1.5 rounded-full bg-current', className)}
      {...props}
    />
  );
}
