import client, { setAccessToken } from './client';

export async function login(username, password) {
  const { data } = await client.post('/auth/login', { username, password });
  setAccessToken(data.accessToken);
  return data.user;
}

export async function refresh() {
  const { data } = await client.post('/auth/refresh');
  setAccessToken(data.accessToken);
  return data.user;
}

export async function logout() {
  try {
    await client.post('/auth/logout');
  } finally {
    setAccessToken(null);
  }
}

export async function me() {
  const { data } = await client.get('/auth/me');
  return data;
}

export async function changePassword(currentPassword, newPassword) {
  const { data } = await client.put('/auth/change-password', { currentPassword, newPassword });
  return data;
}

export async function registerPatient(payload) {
  const { data } = await client.post('/auth/register/patient', payload);
  return data;
}
