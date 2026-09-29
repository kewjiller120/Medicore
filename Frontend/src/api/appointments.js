import { createResourceApi } from './resource';
import client from './client';

/**
 * Appointments follow an approve/reject workflow: every new booking starts
 * Pending and only the attending doctor may approve or reject it (via the
 * dedicated endpoints below). The generic resource calls cover the rest.
 */
export const appointmentsApi = {
  ...createResourceApi('/appointments'),
  approve: async (id) => (await client.put(`/appointments/${id}/approve`)).data,
  reject: async (id) => (await client.put(`/appointments/${id}/reject`)).data,
};