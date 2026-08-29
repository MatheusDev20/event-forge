import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Every visual decision here resolves to a semantic token. There are no raw
 * colour utilities available (the primitive ramps are not in @theme), which is
 * what keeps a one-off shade from creeping into a component.
 *
 * Focus rings are deliberately absent: `:focus-visible` is styled once in the
 * base layer for the whole system.
 */
const button = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium select-none',
    'transition-colors duration-150 ease-standard',
    'disabled:cursor-not-allowed',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-action-primary text-action-primary-fg shadow-xs',
          'hover:bg-action-primary-hover active:bg-action-primary-active',
          'disabled:bg-action-disabled disabled:text-action-disabled-fg disabled:shadow-none',
        ],
        secondary: [
          'bg-action-secondary text-action-secondary-fg border border-border shadow-xs',
          'hover:bg-action-secondary-hover active:bg-action-secondary-active',
          'disabled:bg-action-disabled disabled:text-action-disabled-fg disabled:border-transparent disabled:shadow-none',
        ],
        ghost: [
          'text-text',
          'hover:bg-action-ghost-hover',
          'disabled:text-action-disabled-fg disabled:hover:bg-transparent',
        ],
        danger: [
          'bg-action-danger text-action-danger-fg shadow-xs',
          'hover:bg-action-danger-hover',
          'disabled:bg-action-disabled disabled:text-action-disabled-fg disabled:shadow-none',
        ],
        link: [
          'text-text-brand underline-offset-4 h-auto p-0',
          'hover:underline',
          'disabled:text-action-disabled-fg disabled:hover:no-underline',
        ],
      },
      size: {
        sm: 'h-8 rounded-sm px-3 text-sm',
        md: 'h-10 rounded-md px-4 text-sm',
        lg: 'h-11 rounded-md px-5 text-base',
        'icon-sm': 'size-8 rounded-sm',
        icon: 'size-10 rounded-md',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof button> & {
    /** Render as the given child element instead of a `<button>` — for a link that looks like a button. */
    asChild?: boolean;
    /** Disables the button and swaps the leading slot for a spinner. */
    isLoading?: boolean;
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
  };

export function Button({
  className,
  variant,
  size,
  fullWidth,
  asChild = false,
  isLoading = false,
  leadingIcon,
  trailingIcon,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      className={cn(button({ variant, size, fullWidth }), className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? <Spinner /> : leadingIcon}
      {/*
       * Slottable, not a bare {children}. This component always renders three
       * slots, so under `asChild` it hands Slot an array and Slot — which
       * needs exactly one element to merge onto — throws "Slot failed to slot
       * onto its children". Marking which child is the one to merge into is
       * what lets `asChild` work at all, and it keeps the icons rendering
       * inside the element that replaces the button.
       */}
      <Slottable>{children}</Slottable>
      {trailingIcon}
    </Comp>
  );
}

function Spinner() {
  return (
    <svg
      className="size-4 shrink-0 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { button as buttonVariants };
