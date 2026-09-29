import { createResourceApi } from './resource';
import client from './client';

/**
 * Ambulance requests move through a department workflow:
 *   patient/department -> the department doctor accepts AND dispatches in
 *   one action (available ambulance + available driver) -> admin can adjust
 *   the ambulance/driver or complete; the assigned driver can also complete
 *   their own trip. Completing frees the ambulance and the driver again.
 */
export const ambulanceRequestsApi = {
  ...createResourceApi('/ambulance-requests'),
  accept: async (id, ambulance_id, staff_id) =>
    (await client.put(`/ambulance-requests/${id}/accept`, { ambulance_id, staff_id })).data,
  reject: async (id) => (await client.put(`/ambulance-requests/${id}/reject`)).data,
  assign: async (id, ambulance_id) =>
    (await client.put(`/ambulance-requests/${id}/assign`, { ambulance_id })).data,
  assignDriver: async (id, staff_id) =>
    (await client.put(`/ambulance-requests/${id}/assign-driver`, { staff_id })).data,
  availableDrivers: async () => (await client.get('/ambulance-requests/available-drivers')).data,
  complete: async (id) => (await client.put(`/ambulance-requests/${id}/complete`)).data,
};