/**
 * Organizers and the accounts that act for them.
 *
 * Membership lives in Catalog, not Identity, because of the rule in
 * docs/domain-model.md: other contexts hold an account id and nothing else.
 * An organizer is Catalog's concept, so the link from it to an account is a
 * Catalog row carrying an opaque account id — Identity never learns that
 * organizers exist.
 *
 * Nobody joins an organizer on their own. Its first admin comes from
 * `pnpm org:create`; its admins add everyone after that. See
 * docs/adr/0008-identity-sessions-and-memberships.md.
 */
/**
 * A role inside one organizer. `admin` manages that organizer's people and
 * nobody else's; `member` acts for it.
 */
export const ORGANIZER_MEMBER_ROLES = ['admin', 'member'] as const;

export type OrganizerMemberRole = (typeof ORGANIZER_MEMBER_ROLES)[number];

/** An organizer, from the point of view of one account that belongs to it. */
export type MemberOrganizer = {
  id: string;
  name: string;
  role: OrganizerMemberRole;
};

/**
 * A person in an organizer: Catalog's membership, joined in memory with the
 * name and email Identity holds. Catalog stores neither.
 */
export type OrganizerMember = {
  accountId: string;
  name: string;
  email: string;
  role: OrganizerMemberRole;
};

/** What an admin supplies to add someone: their new account, and their role here. */
export type NewOrganizerMember = {
  name: string;
  email: string;
  password: string;
  role: OrganizerMemberRole;
};
