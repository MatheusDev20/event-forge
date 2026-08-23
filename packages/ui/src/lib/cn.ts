import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting later Tailwind utilities win over earlier ones in
 * the same group. Components use this so a caller's spacing override replaces
 * the default instead of both landing in the class list and CSS order deciding.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
