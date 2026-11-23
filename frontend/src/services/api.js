import axios from 'axios';
import { auth } from './firebase';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 8000,
  headers: { 'X-Requested-With': 'KnowledgeBase' }
});

api.interceptors.request.use(async (config) => {
  if (auth.currentUser) config.headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  return config;
});
