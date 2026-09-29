import client from './client';

export const dashboardApi = {
  summary: async () => (await client.get('/dashboard/summary')).data,
};
