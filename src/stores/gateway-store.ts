import { create } from 'zustand';

import { KEYS, storage } from '../storage/mmkv';

export const DEFAULT_GATEWAY_BASE_URL = 'http://localhost:18790';

export type GatewayState = {
  baseUrl: string;
  token: string;
  unauthorized: boolean;
  setBaseUrl: (v: string) => void;
  setToken: (v: string) => void;
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
  unauthorized: false,

  setBaseUrl: (v) => {
    set({ baseUrl: normalizeBaseUrl(v), unauthorized: false });
  },

  setToken: (v) => {
    set({ token: v.trim(), unauthorized: false });
  },

  hydrateFromStorage: () => {
    const baseUrl = storage.getString(KEYS.baseUrl) ?? '';
    const token = storage.getString(KEYS.token) ?? '';
    set({ baseUrl: normalizeBaseUrl(baseUrl), token, unauthorized: false });
  },

  persist: () => {
    const { baseUrl, token } = get();
    if (baseUrl) storage.set(KEYS.baseUrl, baseUrl);
    else storage.delete(KEYS.baseUrl);
    if (token) storage.set(KEYS.token, token);
    else storage.delete(KEYS.token);
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
