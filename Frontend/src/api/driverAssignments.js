import client from './client';

export const driverAssignmentsApi = {
  list: async () => (await client.get('/driver-assignments')).data,
  mine: async () => (await client.get('/driver-assignments/mine')).data,
  create: async (payload) => (await client.post('/driver-assignments', payload)).data,
  remove: async (staffId, ambulanceId) =>
    (await client.delete(`/driver-assignments/${staffId}/${ambulanceId}`)).data,
};
