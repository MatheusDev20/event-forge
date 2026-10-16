import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import localFont from 'next/font/local';
import './styles/global.css';
import { Providers } from './providers';
import { themeScript } from './lib/theme';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
});
/* Display face for the wordmark and control labels — see --font-display in
 * @repo/tailwind-config. Only the three weights the design uses are fetched. */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Event-Forge Console',
  description: 'Create, price and publish events.',
  /* Nothing here is public, and none of it should ever reach an index. */
  robots: { index: false, follow: false },
};

/**
 * Fonts, theme and providers — nothing visible.
 *
 * The shell an organizer works in (header, sidebar) lives in
 * `(console)/layout.tsx`, and the login page in
 * `(auth)/layout.tsx`. Route groups rather than one layout with conditionals,
 * because the two are different pages, not one page in two states: the
 * signed-out ones must render without a session, and the shell must not render
 * until it has one.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets data-theme before first paint — see app/lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
