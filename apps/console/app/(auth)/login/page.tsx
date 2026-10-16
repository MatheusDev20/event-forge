'use client';

import { loginRequestSchema } from '@repo/contracts/identity';
import { Button } from '@repo/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@repo/ui/card';
import { FieldError, Input, Label } from '@repo/ui/input';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import {
  fieldErrorsFrom,
  formErrorFrom,
  type FieldErrors,
} from '../../lib/form-errors';
import { safeNextPath, useLogin } from '../../lib/session';

/**
 * Suspense because of `useSearchParams`: without a boundary, Next opts the
 * whole route out of static rendering to read `?next=` on the server.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const login = useLogin();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = loginRequestSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });

    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error));
      return;
    }

    setFieldErrors({});
    login.mutate(parsed.data, {
      onSuccess: () => router.replace(next),
      onError: (error) => setFieldErrors(fieldErrorsFrom(error)),
    });
  }

  const formError = formErrorFrom(login.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardBody className="pb-6">
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {formError ? <FieldError>{formError}</FieldError> : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              invalid={Boolean(fieldErrors.email)}
            />
            {fieldErrors.email ? (
              <FieldError>{fieldErrors.email}</FieldError>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              invalid={Boolean(fieldErrors.password)}
            />
            {fieldErrors.password ? (
              <FieldError>{fieldErrors.password}</FieldError>
            ) : null}
          </div>

          <Button type="submit" fullWidth isLoading={login.isPending}>
            Sign in
          </Button>

          <p className="text-text-muted text-center text-sm text-pretty">
            Accounts are provided by your Event-Forge administrator.
          </p>
        </form>
      </CardBody>
    </Card>
  );
}
