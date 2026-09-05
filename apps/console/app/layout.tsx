import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import localFont from 'next/font/local';
import './styles/global.css';
import { ConsoleHeader } from './components/console-header';
import { ConsoleNav } from './components/console-nav';
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
 * Sidebar and content, rather than the storefront's single centred column.
 *
 * The two apps are the same system and share every token, but they are not the
 * same shape: a visitor arrives to browse one thing, an organizer arrives to
 * move between standing sections. The sidebar collapses above the content
 * below `md`, where a persistent rail costs more width than it earns.
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
        <Providers>
          <ConsoleHeader />
          <div className="mx-auto flex max-w-[90rem] flex-col gap-8 px-4 py-6 md:flex-row md:px-8 md:py-8">
            <ConsoleNav className="w-full shrink-0 md:sticky md:top-25 md:w-60 md:self-start" />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
