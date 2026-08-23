import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

const card = cva('bg-surface-raised border-border rounded-lg border', {
  variants: {
    elevation: {
      flat: '',
      raised: 'shadow-sm',
      floating: 'shadow-md',
    },
    interactive: {
      true: [
        'transition-[box-shadow,border-color,transform] duration-200 ease-standard',
        'hover:border-border-strong hover:shadow-md',
        'focus-within:border-border-brand',
      ],
    },
  },
  defaultVariants: {
    elevation: 'raised',
  },
});

export type CardProps = ComponentProps<'div'> & VariantProps<typeof card>;

export function Card({
  className,
  elevation,
  interactive,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(card({ elevation, interactive }), className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-1 px-5 pt-5 pb-3', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('text-text text-lg font-semibold text-balance', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-text-muted text-sm', className)} {...props} />;
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 py-3', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'border-border-subtle flex items-center gap-3 border-t px-5 py-4',
        className,
      )}
      {...props}
    />
  );
}
