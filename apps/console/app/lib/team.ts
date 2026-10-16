'use client';

import {
  listOrganizerMembersResponseSchema,
  organizerMemberSchema,
  type AddOrganizerMemberRequest,
} from '@repo/contracts/catalog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './api/client';

/**
 * The current organizer's people, for its admins.
 *
 * Every call is scoped by organizer id and refused with a 403 unless the
 * signed-in account is an admin *of that organizer* — the server decides
 * that, not the header icon that hides the Team page from everyone else.
 */

const membersKey = (organizerId: string) =>
  ['organizers', organizerId, 'members'] as const;

export function useOrganizerMembers(organizerId: string) {
  return useQuery({
    queryKey: membersKey(organizerId),
    queryFn: () =>
      apiGet(
        `/organizers/${organizerId}/members`,
        listOrganizerMembersResponseSchema,
      ),
  });
}

export function useAddOrganizerMember(organizerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: AddOrganizerMemberRequest) =>
      apiPost(
        `/organizers/${organizerId}/members`,
        organizerMemberSchema,
        body,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: membersKey(organizerId) }),
  });
}
