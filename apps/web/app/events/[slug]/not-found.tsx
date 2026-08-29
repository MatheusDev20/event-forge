import { Button } from '@repo/ui/button';
import { EmptyState } from '@repo/ui/empty-state';
import Link from 'next/link';

export default function EventNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20">
      <EmptyState
        title="That event is not available"
        description="It may have been removed, or it may not be published yet."
        action={
          <Button asChild variant="secondary">
            <Link href="/events">Browse events</Link>
          </Button>
        }
      />
    </main>
  );
}
