import { create } from 'zustand';

import { resolvePreferredBaseUrl } from '../api/connection-strategy';
import { KEYS, storage } from '../storage/mmkv';

export const DEFAULT_GATEWAY_BASE_URL = 'http://localhost:18790';

export type GatewayState = {
  baseUrl: string;
  lanUrl: string | null;
  activeBaseUrl: string;
  token: string;
  unauthorized: boolean;
  setBaseUrl: (v: string) => void;
  setLanUrl: (v: string | null) => void;
  setToken: (v: string) => void;
  refreshActiveBaseUrl: () => Promise<string>;
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
  lanUrl: null,
  activeBaseUrl: '',
  token: '',
  unauthorized: false,

  setBaseUrl: (v) => {
    const baseUrl = normalizeBaseUrl(v);
    set({ baseUrl, unauthorized: false });
  },

  setLanUrl: (v) => {
    set({ lanUrl: v ? normalizeBaseUrl(v) : null, unauthorized: false });
  },

  setToken: (v) => {
    set({ token: v.trim(), unauthorized: false });
  },

  refreshActiveBaseUrl: async () => {
    const { baseUrl, lanUrl } = get();
    if (!baseUrl) {
      set({ activeBaseUrl: '' });
      return '';
    }
    const active = await resolvePreferredBaseUrl(baseUrl, lanUrl ?? undefined);
    set({ activeBaseUrl: active });
    return active;
  },

  hydrateFromStorage: () => {
    const baseUrl = storage.getString(KEYS.baseUrl) ?? '';
    const lanUrl = storage.getString(KEYS.lanUrl) ?? null;
    const token = storage.getString(KEYS.token) ?? '';
    const normalized = normalizeBaseUrl(baseUrl);
    set({
      baseUrl: normalized,
      lanUrl: lanUrl ? normalizeBaseUrl(lanUrl) : null,
      activeBaseUrl: normalized,
      token,
      unauthorized: false,
    });
  },

  persist: () => {
    const { baseUrl, token, lanUrl } = get();
    if (baseUrl) storage.set(KEYS.baseUrl, baseUrl);
    else storage.delete(KEYS.baseUrl);
    if (lanUrl) storage.set(KEYS.lanUrl, lanUrl);
    else storage.delete(KEYS.lanUrl);
    if (token) storage.set(KEYS.token, token);
    else storage.delete(KEYS.token);
  },

  onUnauthorized: () => {
    set({ unauthorized: true });
  },

  apiUrl: (path: string) => {
    const base = normalizeBaseUrl(get().activeBaseUrl || get().baseUrl);
    if (!base) {
      throw new Error('Gateway base URL is not configured');
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  },
}));
