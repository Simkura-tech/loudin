/**
 * People API client.
 *
 * People = door-access credential holders for the signed-in company. The
 * backend scopes every query by req.user.company_id so this client never
 * needs to pass a company filter.
 */

import api from '../api';

export type PersonStatus = 'active' | 'inactive' | 'suspended';

export interface Person {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_number: string | null;
  employee_id: string | null;
  department: string | null;
  job_title: string | null;
  status: PersonStatus;
  notes: string | null;
  group_id: number | null;
  group_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PeopleListResponse {
  people: Person[];
  total: number;
  limit: number;
  offset: number;
}

export interface PersonPayload {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone_number?: string | null;
  employee_id?: string | null;
  department?: string | null;
  job_title?: string | null;
  status?: PersonStatus;
  notes?: string | null;
  group_id?: number | null;
}

export interface ListParams {
  search?: string;
  status?: PersonStatus;
  /** 'none' filters to people with no group; number filters by group id. */
  group_id?: number | 'none';
  limit?: number;
  offset?: number;
}

export const peopleApi = {
  list: (params: ListParams = {}) =>
    api.get<PeopleListResponse, PeopleListResponse>('/api/people', { params }),

  get: (id: number) =>
    api.get<{ person: Person }, { person: Person }>(`/api/people/${id}`).then((r) => r.person),

  create: (payload: PersonPayload) =>
    api
      .post<{ person: Person }, { person: Person }>('/api/people', payload)
      .then((r) => r.person),

  update: (id: number, payload: Partial<PersonPayload>) =>
    api
      .patch<{ person: Person }, { person: Person }>(`/api/people/${id}`, payload)
      .then((r) => r.person),

  remove: (id: number) =>
    api.delete<void, void>(`/api/people/${id}`),
};
