# ADR-0004: Tokens plus headless primitives; daisyUI comes out

- **Status:** Accepted
- **Date:** 2026-08-22

## Context

Practising real design-system work is a stated goal of this project. The
template currently ships daisyUI on Tailwind v4, themed via
`packages/config-tailwind/shared-styles.css`, and a `@repo/ui` package that
contains a single button with its styling hardcoded into the JSX.

daisyUI is a good library and the wrong tool here. It *is* a design system —
someone else's. Using it means the interesting decisions (what the type scale
is, how elevation works, what "primary" means semantically, how a component
exposes variants) arrive pre-made, and the practice available is theming.
`bg-primary` in a component is also a component reaching straight past the
system into a global; that is exactly the coupling a token layer exists to
prevent.

## Decision

Build the design system in `@repo/ui`, in three layers, and remove daisyUI.

1. **Primitive tokens** — the raw scales, as CSS custom properties: colour
   ramps, a modular type scale, a spacing scale, radii, shadows, motion
   durations and easings. Named for what they are (`--color-violet-600`).
2. **Semantic tokens** — an alias layer naming *roles*, not values:
   `--color-surface`, `--color-surface-raised`, `--color-text-muted`,
   `--color-border-strong`, `--color-action-primary-bg`. Theming means
   remapping this layer only. Light and dark ship from day one, because a token
   layer that has never been re-themed is untested.
3. **Components** — unstyled primitives from **Radix UI** for anything with
   behaviour or accessibility surface (dialog, popover, select, tooltip,
   tabs), styled with **CVA** variants against semantic tokens only. A
   component that references a primitive token directly is a lint error.

Rules: components never take arbitrary `className` overrides for layout, and
never hardcode colour. Every component ships its variants explicitly.

## Consequences

- Full ownership of the visual language, which is the point.
- Slower to a good-looking screen than daisyUI would be. Accepted: the first
  slice is deliberately low on domain complexity (ADR-0005 / roadmap) partly to
  make room for this.
- Radix brings accessible focus management, keyboard behaviour and ARIA that we
  would otherwise get wrong — this is the one part of a design system worth
  taking from a library, because it is behaviour, not design.
- The token layer must be consumable by both `@repo/ui` and `apps/web`, so it
  lives in CSS custom properties exposed through
  `packages/config-tailwind`, not in a JS theme object.
- `daisyui` and `theme-change` are removed from all three package.json files,
  and the existing `data-theme` switching is rebuilt against our own tokens.

## Alternatives considered

- **Keep daisyUI and theme it.** Fastest to a polished UI; teaches theming
  rather than system design. Rejected against the project's stated goal.
- **shadcn/ui vendored components.** Real ownership and a fast start, but it
  hands us its tokens and its component API decisions — the exact decisions
  worth making ourselves here. Its patterns remain a useful reference.
