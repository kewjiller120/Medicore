import client from './client';

/**
 * Builds the standard { list, getOne, create, update, remove } set of
 * calls for a REST resource mounted at `basePath` (e.g. '/departments').
 * Every backend module in this project follows the same shape
 * (GET /, GET /:id, POST /, PUT /:id, DELETE /:id), so one small factory
 * covers all of them instead of hand-writing the same five functions
 * fifteen times over.
 */
export function createResourceApi(basePath) {
  return {
    list: async (params) => (await client.get(basePath, { params })).data,
    getOne: async (id) => (await client.get(`${basePath}/${id}`)).data,
    create: async (payload) => (await client.post(basePath, payload)).data,
    update: async (id, payload) => (await client.put(`${basePath}/${id}`, payload)).data,
    remove: async (id) => (await client.delete(`${basePath}/${id}`)).data,
  };
}
