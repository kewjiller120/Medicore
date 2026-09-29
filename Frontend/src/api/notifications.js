import client from './client';

/** Notification feed API - rows are created by DB triggers on the backend. */
export const notificationsApi = {
  list: async (params) => (await client.get('/notifications', { params })).data,
  unreadCount: async () => (await client.get('/notifications/unread-count')).data,
  markRead: async (id) => (await client.patch(`/notifications/${id}/read`)).data,
  markAllRead: async () => (await client.patch('/notifications/read-all')).data,
};