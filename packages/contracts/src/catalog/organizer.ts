import { z } from 'zod';
import { emailSchema, passwordSchema } from '../identity/account';

/**
 * Organizer contracts — the company or brand that owns events, and the
 * accounts allowed to act for it.
 *
 * An organizer is not a login. "Forge Live" is an organizer; the people who
 * run its shows each have their own account and a membership in it.
 *
 * Nobody creates either for themselves. An organizer and its first admin come
 * from `pnpm org:create`; from then on, that organizer's admins add the rest
 * of its people — and only its own. See
 * docs/adr/0008-identity-sessions-and-memberships.md.
 */

/**
 * A role *inside one organizer*. `admin` manages that organizer's people;
 * `member` acts for it. Being an admin of one organizer says nothing about any
 * other.
 */
export const organizerMemberRoleSchema = z.enum(['admin', 'member']);

export const organizerIdSchema = z.uuid();

/** An organizer as seen by one of its members — their role included. */
export const memberOrganizerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: organizerMemberRoleSchema,
});

/** `GET /organizers`: the signed-in account's own. */
export const listMyOrganizersResponseSchema = z.object({
  items: z.array(memberOrganizerSchema),
});

/* ------------------------------------------------------------------ *
 * Members — `/organizers/:organizerId/members`, admins of it only
 * ------------------------------------------------------------------ */

/** A person in an organizer, as its admins see them. */
export const organizerMemberSchema = z.object({
  accountId: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: organizerMemberRoleSchema,
});

/**
 * Not paginated: an organizer's team is a handful of people, and the screen
 * that lists them shows all of them.
 */
export const listOrganizerMembersResponseSchema = z.object({
  items: z.array(organizerMemberSchema),
});

/**
 * Creates the person's account and their membership in one request.
 *
 * The password is a temporary one the admin chooses and passes on. It obeys
 * the same rules as any password, because it *is* the account's password
 * until something lets them change it.
 */
export const addOrganizerMemberRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
  role: organizerMemberRoleSchema.default('member'),
});

export type OrganizerMemberRole = z.infer<typeof organizerMemberRoleSchema>;
export type MemberOrganizer = z.infer<typeof memberOrganizerSchema>;
export type ListMyOrganizersResponse = z.infer<
  typeof listMyOrganizersResponseSchema
>;
export type OrganizerMember = z.infer<typeof organizerMemberSchema>;
export type ListOrganizerMembersResponse = z.infer<
  typeof listOrganizerMembersResponseSchema
>;
/** What a client sends: `role` may be omitted. */
export type AddOrganizerMemberRequest = z.input<
  typeof addOrganizerMemberRequestSchema
>;
/** What the server receives after parsing: `role` is always set. */
export type AddOrganizerMemberBody = z.output<
  typeof addOrganizerMemberRequestSchema
>;
