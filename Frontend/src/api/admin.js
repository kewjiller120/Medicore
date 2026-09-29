import client from './client';

export const adminApi = {
  listUsers: async () => (await client.get('/admin/users')).data,
  createUser: async (payload) => (await client.post('/admin/users', payload)).data,
  updateUser: async (id, payload) => (await client.patch(`/admin/users/${id}`, payload)).data,
  deleteUser: async (id) => (await client.delete(`/admin/users/${id}`)).data,
};
