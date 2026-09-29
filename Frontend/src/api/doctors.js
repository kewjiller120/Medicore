import client from './client';

export const doctorsApi = {
  list: async (params) => (await client.get('/doctors', { params })).data,
  getOne: async (id) => (await client.get(`/doctors/${id}`)).data,
  update: async (id, payload) => (await client.put(`/doctors/${id}`, payload)).data,
};
