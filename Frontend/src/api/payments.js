import client from './client';

export const paymentsApi = {
  list: async (params) => (await client.get('/payments', { params })).data,
  getOne: async (id) => (await client.get(`/payments/${id}`)).data,
  create: async (payload) => (await client.post('/payments', payload)).data,
  confirm: async (id) => (await client.put(`/payments/${id}/confirm`)).data,
  reject: async (id) => (await client.put(`/payments/${id}/reject`)).data,
  remove: async (id) => (await client.delete(`/payments/${id}`)).data,
};
