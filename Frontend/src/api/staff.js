import client from './client';

export const staffApi = {
  list: async (params) => (await client.get('/staff', { params })).data,
  getOne: async (id) => (await client.get(`/staff/${id}`)).data,
  update: async (id, payload) => (await client.put(`/staff/${id}`, payload)).data,
};
