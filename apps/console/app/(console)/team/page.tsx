'use client';

import {
  addOrganizerMemberRequestSchema,
  type MemberOrganizer,
} from '@repo/contracts/catalog';
import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { FieldError, FieldHint, Input, Label } from '@repo/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/select';
import { Skeleton } from '@repo/ui/skeleton';
import { useState, type FormEvent } from 'react';
import {
  fieldErrorsFrom,
  formErrorFrom,
  type FieldErrors,
} from '../../lib/form-errors';
import { useConsoleSession } from '../../lib/session';
import { useAddOrganizerMember, useOrganizerMembers } from '../../lib/team';

/**
 * The current organizer's people: who can sign in to act for it, and the
 * form an admin uses to add someone.
 *
 * This is how accounts come to exist (ADR-0008). Adding a person creates
 * their account with a temporary password the admin types here and passes on
 * by whatever channel they already trust.
 */
export default function TeamPage() {
  const { organizer } = useConsoleSession();

  if (organizer.role !== 'admin') {
    // The header hides the way here from non-admins and the API refuses them
    // anyway; this covers someone typing the URL, with a sentence, not a 403.
    return (
      <EmptyState
        title="Admins only"
        description={`Ask an admin of ${organizer.name} to add or change people.`}
      />
    );
  }

  return <Team organizer={organizer} />;
}

function Team({ organizer }: { organizer: MemberOrganizer }) {
  const members = useOrganizerMembers(organizer.id);

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-text text-3xl font-semibold">Team</h1>
        <p className="text-text-muted text-base text-pretty">
          The people who can sign in to act for {organizer.name}. Nobody can
          create an account on their own — they get one here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
        </CardHeader>
        <CardBody className="pb-4">
          {members.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : members.isError ? (
            <FieldError>{members.error.message}</FieldError>
          ) : (
            <ul className="divide-border-subtle flex flex-col divide-y">
              {members.data.items.map((member) => (
                <li
                  key={member.accountId}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="text-text truncate text-sm font-medium">
                      {member.name}
                    </span>
                    <span className="text-text-muted truncate text-xs">
                      {member.email}
                    </span>
                  </div>
                  <Badge
                    size="sm"
                    tone={member.role === 'admin' ? 'brand' : 'neutral'}
                  >
                    {member.role}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <AddMemberForm organizerId={organizer.id} />
    </div>
  );
}

function AddMemberForm({ organizerId }: { organizerId: string }) {
  const add = useAddOrganizerMember(organizerId);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [added, setAdded] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = addOrganizerMemberRequestSchema.safeParse({
      name: data.get('name'),
      email: data.get('email'),
      password: data.get('password'),
      role: data.get('role'),
    });

    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error));
      return;
    }

    setFieldErrors({});
    setAdded(null);
    add.mutate(parsed.data, {
      onSuccess: (member) => {
        form.reset();
        setAdded(member.email);
      },
      onError: (error) => setFieldErrors(fieldErrorsFrom(error)),
    });
  }

  const formError = formErrorFrom(add.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a person</CardTitle>
      </CardHeader>
      <CardBody className="pb-5">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={onSubmit}
          noValidate
        >
          {formError ? (
            <FieldError className="sm:col-span-2">{formError}</FieldError>
          ) : null}
          {added ? (
            <p role="status" className="text-text-muted text-sm sm:col-span-2">
              Account created for{' '}
              <span className="text-text font-medium">{added}</span>. Share the
              temporary password with them.
            </p>
          ) : null}

          <Field label="Name" name="name" error={fieldErrors.name} />
          <Field
            label="Email"
            name="email"
            type="email"
            error={fieldErrors.email}
          />
          <Field
            label="Temporary password"
            name="password"
            error={fieldErrors.password}
            hint="At least 8 characters. They sign in with this."
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="member-role">Role</Label>
            {/* Radix renders a hidden native select for `name`, so the
                choice still arrives in FormData like any other field. */}
            <Select name="role" defaultValue="member">
              <SelectTrigger id="member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">
                  Admin — can manage the team
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            className="sm:col-span-2 sm:justify-self-start"
            isLoading={add.isPending}
          >
            Create account
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function Field({
  label,
  name,
  type = 'text',
  error,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  hint?: string;
}) {
  const id = `member-${name}`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete="off"
        invalid={Boolean(error)}
      />
      {error ? (
        <FieldError>{error}</FieldError>
      ) : hint ? (
        <FieldHint>{hint}</FieldHint>
      ) : null}
    </div>
  );
}
