import type { Metadata } from 'next';
import Link from 'next/link';
import './styles/global.css';

export const metadata: Metadata = {
  title: {
    default: 'Event Forge Lab',
    template: '%s — Event Forge Lab',
  },
  description:
    'Experiments in concurrency, scalability, database migrations and design systems, run against a real ticketing system.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <header className="mb-12">
            <Link href="/" className="font-semibold">
              Event Forge Lab
            </Link>
          </header>
          <main>{children}</main>
          <footer className="mt-20 border-t border-neutral-200 pt-6 text-sm text-neutral-500">
            A personal lab. Each experiment asks one question and answers it with
            a test.
          </footer>
        </div>
      </body>
    </html>
  );
}
