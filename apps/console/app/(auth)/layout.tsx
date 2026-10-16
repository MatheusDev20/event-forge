import Link from 'next/link';

/**
 * The signed-out page: one narrow column, the wordmark, and nothing to
 * navigate to. Only /login lives here today — there is no signup.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-12 md:py-20">
      <Link href="/" className="mb-8">
        <span className="font-display text-text text-[23px] font-bold tracking-[-0.035em]">
          Event<span className="text-text-muted">Forge</span>{' '}
          <span className="text-text-brand">Console</span>
        </span>
      </Link>
      <main className="w-full max-w-sm">{children}</main>
    </div>
  );
}
