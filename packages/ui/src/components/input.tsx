import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

const field = cva(
  [
    'flex w-full items-center gap-2 rounded-md border transition-colors duration-150 ease-standard',
    'bg-surface border-border text-text',
    'has-[input:disabled]:bg-surface-sunken has-[input:disabled]:text-text-subtle has-[input:disabled]:cursor-not-allowed',
    /* The wrapper draws the focus ring so the icons sit inside it. */
    'has-[input:focus-visible]:border-border-brand',
  ],
  {
    variants: {
      size: {
        sm: 'h-8 px-2.5 text-sm',
        md: 'h-10 px-3 text-sm',
        lg: 'h-11 px-3.5 text-base',
      },
      invalid: {
        true: 'border-danger-border',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

export type InputProps = Omit<ComponentProps<'input'>, 'size'> &
  VariantProps<typeof field> & {
    leadingIcon?: ReactNode;
    trailingSlot?: ReactNode;
    containerClassName?: string;
  };

export function Input({
  className,
  containerClassName,
  size,
  invalid,
  leadingIcon,
  trailingSlot,
  ...props
}: InputProps) {
  return (
    <div className={cn(field({ size, invalid }), containerClassName)}>
      {leadingIcon ? (
        <span
          className="text-text-subtle flex shrink-0 items-center"
          aria-hidden="true"
        >
          {leadingIcon}
        </span>
      ) : null}
      <input
        aria-invalid={invalid || undefined}
        className={cn(
          'placeholder:text-text-subtle h-full w-full bg-transparent outline-none',
          'disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />
      {trailingSlot ? (
        <span className="flex shrink-0 items-center">{trailingSlot}</span>
      ) : null}
    </div>
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn('text-text text-sm font-medium', className)}
      {...props}
    />
  );
}

export function FieldHint({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-text-muted text-xs', className)} {...props} />;
}

export function FieldError({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      role="alert"
      className={cn('text-danger-fg text-xs', className)}
      {...props}
    />
  );
}
