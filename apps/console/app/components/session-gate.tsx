'use client';

import { Button } from '@repo/ui/button';
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/card';
import { Skeleton } from '@repo/ui/skeleton';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  isUnauthenticated,
  SessionProvider,
  useLogout,
  useMe,
  useMyOrganizers,
} from '../lib/session';

/**
 * Renders the console shell only once the API has said who is signed in, and
 * stops everyone who cannot use it yet:
 *
 * - no session (or an expired one) → /login, remembering where they were going
 * - an account that belongs to no organizer → told to ask an admin. Not a
 *   form: memberships are provisioned, not self-served (ADR-0008).
 *
 * The proxy has already turned away anyone with no cookie at all. What reaches
 * this component and still fails is a cookie the API does not recognise, which
 * only the API can tell.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const organizers = useMyOrganizers({ enabled: me.isSuccess });

  const signedOut =
    isUnauthenticated(me.error) || isUnauthenticated(organizers.error);

  useEffect(() => {
    if (!signedOut) return;

    const next =
      pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    router.replace(`/login${next}`);
  }, [signedOut, pathname, router]);

  if (me.isSuccess && organizers.isSuccess) {
    const account = me.data.account;
    const organizer = organizers.data.items[0];

    if (!organizer) return <NotAssigned name={account.name} />;

    return (
      <SessionProvider value={{ account, organizer }}>
        {children}
      </SessionProvider>
    );
  }

  const failure = signedOut ? null : (me.error ?? organizers.error);

  if (failure) {
    return (
      <CenteredCard title="Could not reach the API">
        <p>{failure.message}</p>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            void me.refetch();
            void organizers.refetch();
          }}
        >
          Try again
        </Button>
      </CenteredCard>
    );
  }

  // Loading, or on the way to the login page: either way, nothing to show yet.
  return (
    <div
      className="mx-auto flex max-w-[90rem] flex-col gap-6 px-4 py-6 md:px-8 md:py-8"
      aria-busy="true"
    >
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full max-w-3xl" />
    </div>
  );
}

/**
 * Signed in, and nothing to act for. The way out is a person, not a button —
 * but logging out is offered, because they may be on someone else's machine.
 */
function NotAssigned({ name }: { name: string }) {
  const logout = useLogout();
  const router = useRouter();

  return (
    <CenteredCard
      title={`Hi, ${name}`}
      description="Your account is not part of an organizer yet."
    >
      <p>
        Ask an admin of your organization to add you. Once they have, sign in
        again and your events will be here.
      </p>
      <Button
        variant="secondary"
        className="self-start"
        isLoading={logout.isPending}
        onClick={() =>
          logout.mutate(undefined, {
            onSettled: () => router.replace('/login'),
          })
        }
      >
        Log out
      </Button>
    </CenteredCard>
  );
}

function CenteredCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardBody className="text-text-muted flex flex-col gap-4 pb-5 text-sm">
          {children}
        </CardBody>
      </Card>
    </div>
  );
}
