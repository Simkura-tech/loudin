/**
 * People groups API client.
 *
 * Flat (single-level) groupings of people. Each person belongs to at most
 * one group. Tenant-scoped server-side.
 */

import api from '../api';

export type GroupStatus = 'active' | 'inactive';

export interface PeopleGroup {
  id: number;
  name: string;
  description: string | null;
  status: GroupStatus;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface PeopleGroupPayload {
  name: string;
  description?: string | null;
  status?: GroupStatus;
}

export const peopleGroupsApi = {
  list: () =>
    api.get<{ groups: PeopleGroup[] }, { groups: PeopleGroup[] }>('/api/people-groups')
       .then((r) => r.groups),

  create: (payload: PeopleGroupPayload) =>
    api.post<{ group: PeopleGroup }, { group: PeopleGroup }>('/api/people-groups', payload)
       .then((r) => r.group),

  update: (id: number, payload: Partial<PeopleGroupPayload>) =>
    api.patch<{ group: PeopleGroup }, { group: PeopleGroup }>(`/api/people-groups/${id}`, payload)
       .then((r) => r.group),

  remove: (id: number) =>
    api.delete<void, void>(`/api/people-groups/${id}`),
};
