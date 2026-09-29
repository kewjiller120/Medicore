import client from './client';
import { createResourceApi } from './resource';

const base = createResourceApi('/prescriptions');

export const prescriptionsApi = {
  ...base,
  addItem: async (prescriptionId, payload) =>
    (await client.post(`/prescriptions/${prescriptionId}/items`, payload)).data,
  updateItem: async (prescriptionId, itemId, payload) =>
    (await client.put(`/prescriptions/${prescriptionId}/items/${itemId}`, payload)).data,
  removeItem: async (prescriptionId, itemId) =>
    (await client.delete(`/prescriptions/${prescriptionId}/items/${itemId}`)).data,
};
