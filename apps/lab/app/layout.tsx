import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import Link from 'next/link';
import { LanguageSwitch } from './components/language-switch';
import './styles/global.css';

/*
 * The lab is set in IBM Plex Mono throughout — body copy included, not just
 * code. It has no variable cut, so every weight and style in use is listed
 * explicitly: 400 body, 500 `font-medium`, 600 headings, italic for emphasis
 * and blockquotes. Wired to Tailwind's `--font-mono` token in global.css.
 */
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-ibm-plex-mono',
});

/*
 * The lede sits in IBM Plex Sans, as in the mock — the only place the site
 * leaves mono. This one has a variable cut, so no weight list is needed.
 */
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ibm-plex-sans',
});

export const metadata: Metadata = {
  title: {
    default: 'Matheus de Paula — Writing',
    template: '%s — Matheus de Paula',
  },
  description:
    'Notes on whatever I am studying, reading or curious about: mostly backend engineering, plus experiments run against Event Forge, a ticketing system I built in order to break it.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ibmPlexMono.variable} ${ibmPlexSans.variable}`}>
      <body className="min-h-screen bg-[rgb(251,251,249)] font-mono text-neutral-900 antialiased">
        <div className="mx-auto max-w-3xl px-6 pb-6">
          {/*
           * The rule belongs to the header, so the padding that sets its
           * height lives here too — hence no `py` on the container above.
           * Baseline alignment keeps the 16px brand and the 12px nav sitting
           * on one line regardless of their differing cap heights.
           */}
          <header className="mb-12 flex flex-wrap items-baseline justify-between gap-4 border-b-2 border-[rgb(20,22,26)] pt-[30px] pb-3">
            <Link
              href="/"
              className="font-semibold tracking-[-0.01em] text-[rgb(20,22,26)]"
            >
              Matheus de Paula
            </Link>

            <div className="flex flex-wrap gap-4 text-xs text-[rgb(107,112,118)]">
              <Link href="/">writing</Link>
              <Link href="/">about</Link>
              <a
                href="https://github.com/MatheusDev20"
                target="_blank"
                rel="noreferrer"
                className="border-b border-[rgba(43,108,176,0.3)] leading-none text-[rgb(43,108,176)]"
              >
                github
              </a>
              <a
                href="https://www.linkedin.com/in/MatheusDev20"
                target="_blank"
                rel="noreferrer"
                className="border-b border-[rgba(43,108,176,0.3)] leading-none text-[rgb(43,108,176)]"
              >
                linkedin
              </a>
              <LanguageSwitch />
            </div>
          </header>
          <main>{children}</main>
          {/* Rendered at build time, so the year advances on the next deploy. */}
          <footer className="mt-20 border-t border-neutral-200 pt-6 text-xs text-[rgb(107,112,118)]">
            Matheus de Paula © {new Date().getFullYear()}
          </footer>
        </div>
      </body>
    </html>
  );
}
