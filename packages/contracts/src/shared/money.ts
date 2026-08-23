import { z } from 'zod';

/**
 * Money is always an integer in the currency's minor unit (cents), never a
 * float. Floating point money is a rounding bug waiting for the first order
 * that ends in .015, and this project will eventually sum thousands of them.
 */
export const currencyCodeSchema = z.enum(['BRL', 'USD', 'EUR']);

export const moneySchema = z.object({
  amountMinor: z.int().nonnegative(),
  currency: currencyCodeSchema,
});

export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
export type Money = z.infer<typeof moneySchema>;
