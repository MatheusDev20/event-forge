import type { Money } from '@repo/contracts/shared';

/**
 * One locale and one timezone, hardcoded. Internationalisation is an explicit
 * non-goal (docs/product-brief.md), and pinning them keeps server-rendered
 * output identical to what the client would produce — a mismatch here is a
 * hydration error, not a cosmetic difference.
 */
const LOCALE = 'pt-BR';
const TIME_ZONE = 'America/Sao_Paulo';

export function formatMoney(money: Money): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: money.currency,
  }).format(money.amountMinor / 100);
}

export function formatEventDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function formatEventTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function formatEventDateTime(iso: string): string {
  return `${formatEventDate(iso)} · ${formatEventTime(iso)}`;
}
