import { create } from 'zustand';

import { resolvePreferredBaseUrl } from '../api/connection-strategy';
import { KEYS, storage } from '../storage/mmkv';

import {
  buildGatewayProfile,
  gatewayProfileNameFromUrl,
  normalizeGatewayBaseUrl,
  preferredActiveBaseUrlFromFlat,
  resolveEffectiveGatewayBaseUrl,
  type GatewayProfile,
  type GatewayProfileInput,
} from './gateway-types';

export const DEFAULT_GATEWAY_BASE_URL = '';
export const GATEWAY_BASE_URL_PLACEHOLDER = 'http://192.168.x.x:18790';

export type GatewayState = {
  profiles: GatewayProfile[];
  activeGatewayId: string | null;
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
  findProfileByBaseUrl: (url: string) => GatewayProfile | null;
  getActiveProfile: () => GatewayProfile | null;
  applyActiveProfile: (id: string | null) => void;
  addProfile: (input: GatewayProfileInput, options?: { setActive?: boolean }) => string;
  updateProfile: (id: string, patch: Partial<GatewayProfileInput>) => void;
  removeProfile: (id: string) => void;
  switchGateway: (id: string) => void;
};

function normalizeBaseUrl(raw: string): string {
  return normalizeGatewayBaseUrl(raw);
}

function flatFieldsFromProfile(profile: GatewayProfile | null): Pick<
  GatewayState,
  'baseUrl' | 'lanUrl' | 'token' | 'activeBaseUrl' | 'unauthorized'
> {
  if (!profile) {
    return {
      baseUrl: '',
      lanUrl: null,
      token: '',
      activeBaseUrl: '',
      unauthorized: false,
    };
  }
  const baseUrl = normalizeBaseUrl(profile.baseUrl);
  const lanUrl = profile.lanUrl ? normalizeBaseUrl(profile.lanUrl) : null;
  return {
    baseUrl,
    lanUrl,
    token: profile.token.trim(),
    // Prefer LAN route until health probe confirms otherwise.
    activeBaseUrl: preferredActiveBaseUrlFromFlat({ baseUrl, lanUrl }),
    unauthorized: false,
  };
}

function parseProfilesJson(raw: string): GatewayProfile[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((item): item is GatewayProfile => {
        return (
          typeof item === 'object' &&
          item != null &&
          typeof (item as GatewayProfile).id === 'string' &&
          typeof (item as GatewayProfile).baseUrl === 'string'
        );
      })
      .map((profile) => ({
        ...profile,
        name: profile.name?.trim() || gatewayProfileNameFromUrl(profile.baseUrl),
        baseUrl: normalizeBaseUrl(profile.baseUrl),
        lanUrl: profile.lanUrl ? normalizeBaseUrl(profile.lanUrl) : null,
        token: (profile.token ?? '').trim(),
        updatedAt: profile.updatedAt ?? Date.now(),
      }));
  } catch {
    return null;
  }
}

function deleteLegacyGatewayKeys(): void {
  storage.delete(KEYS.baseUrl);
  storage.delete(KEYS.lanUrl);
  storage.delete(KEYS.token);
}

function syncActiveProfileFromFlat(
  profiles: GatewayProfile[],
  activeGatewayId: string | null,
  baseUrl: string,
  lanUrl: string | null,
  token: string,
): GatewayProfile[] {
  if (!activeGatewayId) return profiles;
  const idx = profiles.findIndex((p) => p.id === activeGatewayId);
  if (idx < 0) return profiles;
  const next = [...profiles];
  next[idx] = {
    ...next[idx],
    baseUrl: normalizeBaseUrl(baseUrl),
    lanUrl: lanUrl ? normalizeBaseUrl(lanUrl) : null,
    token: token.trim(),
    updatedAt: Date.now(),
  };
  return next;
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  profiles: [],
  activeGatewayId: null,
  baseUrl: '',
  lanUrl: null,
  activeBaseUrl: '',
  token: '',
  unauthorized: false,

  setBaseUrl: (v) => {
    const baseUrl = normalizeBaseUrl(v);
    const { profiles, activeGatewayId, lanUrl, token, activeBaseUrl } = get();
    set({
      baseUrl,
      unauthorized: false,
      activeBaseUrl: activeGatewayId
        ? preferredActiveBaseUrlFromFlat({ baseUrl, lanUrl })
        : activeBaseUrl,
      profiles: syncActiveProfileFromFlat(profiles, activeGatewayId, baseUrl, lanUrl, token),
    });
  },

  setLanUrl: (v) => {
    const lanUrl = v ? normalizeBaseUrl(v) : null;
    const { profiles, activeGatewayId, baseUrl, token, activeBaseUrl } = get();
    set({
      lanUrl,
      unauthorized: false,
      activeBaseUrl: activeGatewayId
        ? preferredActiveBaseUrlFromFlat({ baseUrl, lanUrl })
        : activeBaseUrl,
      profiles: syncActiveProfileFromFlat(profiles, activeGatewayId, baseUrl, lanUrl, token),
    });
  },

  setToken: (v) => {
    const token = v.trim();
    const { profiles, activeGatewayId, baseUrl, lanUrl } = get();
    set({
      token,
      unauthorized: false,
      profiles: syncActiveProfileFromFlat(profiles, activeGatewayId, baseUrl, lanUrl, token),
    });
  },

  refreshActiveBaseUrl: async () => {
    const { baseUrl, lanUrl, token } = get();
    const tunnel = normalizeBaseUrl(baseUrl);
    const lan = lanUrl ? normalizeBaseUrl(lanUrl) : '';

    if (!tunnel && !lan) {
      set({ activeBaseUrl: '' });
      return '';
    }

    const active = await resolvePreferredBaseUrl(baseUrl, lanUrl ?? undefined, { token });
    const resolved = normalizeBaseUrl(active) || lan || tunnel;
    set({ activeBaseUrl: resolved });
    return resolved;
  },

  hydrateFromStorage: () => {
    const profilesJson = storage.getString(KEYS.profiles);
    if (profilesJson) {
      const profiles = parseProfilesJson(profilesJson) ?? [];
      const storedActiveId = storage.getString(KEYS.activeId) ?? null;
      const activeGatewayId =
        storedActiveId && profiles.some((p) => p.id === storedActiveId)
          ? storedActiveId
          : (profiles[0]?.id ?? null);
      const activeProfile = profiles.find((p) => p.id === activeGatewayId) ?? null;
      set({
        profiles,
        activeGatewayId,
        ...flatFieldsFromProfile(activeProfile),
      });
      return;
    }

    const legacyBaseUrl = storage.getString(KEYS.baseUrl) ?? '';
    const legacyLanUrl = storage.getString(KEYS.lanUrl) ?? null;
    const legacyToken = storage.getString(KEYS.token) ?? '';

    if (legacyBaseUrl.trim()) {
      const profile = buildGatewayProfile({
        baseUrl: legacyBaseUrl,
        lanUrl: legacyLanUrl,
        token: legacyToken,
      });
      set({
        profiles: [profile],
        activeGatewayId: profile.id,
        ...flatFieldsFromProfile(profile),
      });
      storage.set(KEYS.profiles, JSON.stringify([profile]));
      storage.set(KEYS.activeId, profile.id);
      deleteLegacyGatewayKeys();
      return;
    }

    set({
      profiles: [],
      activeGatewayId: null,
      ...flatFieldsFromProfile(null),
    });
  },

  persist: () => {
    const { profiles, activeGatewayId } = get();
    if (profiles.length > 0) {
      storage.set(KEYS.profiles, JSON.stringify(profiles));
      if (activeGatewayId) storage.set(KEYS.activeId, activeGatewayId);
      else storage.delete(KEYS.activeId);
    } else {
      storage.delete(KEYS.profiles);
      storage.delete(KEYS.activeId);
    }
    deleteLegacyGatewayKeys();
  },

  onUnauthorized: () => {
    set({ unauthorized: true });
  },

  apiUrl: (path: string) => {
    const base = resolveEffectiveGatewayBaseUrl(get());
    if (!base) {
      throw new Error('Gateway base URL is not configured');
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  },

  findProfileByBaseUrl: (url: string) => {
    const normalized = normalizeBaseUrl(url);
    return get().profiles.find((p) => normalizeBaseUrl(p.baseUrl) === normalized) ?? null;
  },

  getActiveProfile: () => {
    const { profiles, activeGatewayId } = get();
    if (!activeGatewayId) return null;
    return profiles.find((p) => p.id === activeGatewayId) ?? null;
  },

  applyActiveProfile: (id) => {
    const { profiles } = get();
    const profile = id ? (profiles.find((p) => p.id === id) ?? null) : null;
    set({
      activeGatewayId: profile?.id ?? null,
      ...flatFieldsFromProfile(profile),
    });
  },

  addProfile: (input, options) => {
    const profile = buildGatewayProfile(input);
    const setActive = options?.setActive !== false;
    const profiles = [...get().profiles, profile];
    if (setActive) {
      set({
        profiles,
        activeGatewayId: profile.id,
        ...flatFieldsFromProfile(profile),
      });
    } else {
      set({ profiles });
    }
    get().persist();
    return profile.id;
  },

  updateProfile: (id, patch) => {
    const { profiles, activeGatewayId } = get();
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx < 0) return;

    const current = profiles[idx];
    const baseUrl = patch.baseUrl != null ? normalizeBaseUrl(patch.baseUrl) : current.baseUrl;
    const updated: GatewayProfile = {
      ...current,
      name:
        patch.name !== undefined
          ? patch.name.trim() || gatewayProfileNameFromUrl(baseUrl)
          : current.name,
      baseUrl,
      lanUrl:
        patch.lanUrl !== undefined
          ? patch.lanUrl?.trim()
            ? normalizeBaseUrl(patch.lanUrl)
            : null
          : current.lanUrl,
      token: patch.token !== undefined ? patch.token.trim() : current.token,
      updatedAt: Date.now(),
    };

    const nextProfiles = [...profiles];
    nextProfiles[idx] = updated;
    const patchState: Partial<GatewayState> = { profiles: nextProfiles };
    if (activeGatewayId === id) {
      Object.assign(patchState, flatFieldsFromProfile(updated));
    }
    set(patchState);
    get().persist();
  },

  removeProfile: (id) => {
    const { profiles, activeGatewayId } = get();
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx < 0) return;

    const nextProfiles = profiles.filter((p) => p.id !== id);
    if (activeGatewayId !== id) {
      set({ profiles: nextProfiles });
      get().persist();
      return;
    }

    const nextActive = nextProfiles[0]?.id ?? null;
    const nextProfile = nextActive ? (nextProfiles.find((p) => p.id === nextActive) ?? null) : null;
    set({
      profiles: nextProfiles,
      activeGatewayId: nextActive,
      ...flatFieldsFromProfile(nextProfile),
    });
    get().persist();
  },

  switchGateway: (id) => {
    const profile = get().profiles.find((p) => p.id === id);
    if (!profile) return;
    set({
      activeGatewayId: id,
      ...flatFieldsFromProfile(profile),
      unauthorized: false,
    });
    get().persist();
  },
}));
