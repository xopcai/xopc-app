import { create } from 'zustand';

import { KEYS, storage } from '../storage/mmkv';

export const DEFAULT_GATEWAY_BASE_URL = 'http://localhost:18790';

export type GatewayState = {
  baseUrl: string;
  token: string;
  thinking: string;
  unauthorized: boolean;
  setBaseUrl: (v: string) => void;
  setToken: (v: string) => void;
  setThinking: (v: string) => void;
  hydrateFromStorage: () => void;
  persist: () => void;
  onUnauthorized: () => void;
  apiUrl: (path: string) => string;
};

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  baseUrl: '',
  token: '',
  thinking: '',
  unauthorized: false,

  setBaseUrl: (v) => {
    set({ baseUrl: normalizeBaseUrl(v), unauthorized: false });
  },

  setToken: (v) => {
    set({ token: v.trim(), unauthorized: false });
  },

  setThinking: (v) => {
    set({ thinking: v.trim() });
  },

  hydrateFromStorage: () => {
    const baseUrl = storage.getString(KEYS.baseUrl) ?? '';
    const token = storage.getString(KEYS.token) ?? '';
    const thinking = storage.getString(KEYS.thinking) ?? '';
    set({ baseUrl: normalizeBaseUrl(baseUrl), token, thinking, unauthorized: false });
  },

  persist: () => {
    const { baseUrl, token, thinking } = get();
    if (baseUrl) storage.set(KEYS.baseUrl, baseUrl);
    else storage.delete(KEYS.baseUrl);
    if (token) storage.set(KEYS.token, token);
    else storage.delete(KEYS.token);
    if (thinking) storage.set(KEYS.thinking, thinking);
    else storage.delete(KEYS.thinking);
  },

  onUnauthorized: () => {
    set({ unauthorized: true });
  },

  apiUrl: (path: string) => {
    const base = normalizeBaseUrl(get().baseUrl);
    if (!base) {
      throw new Error('Gateway base URL is not configured');
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  },
}));
