import Constants, { ExecutionEnvironment } from 'expo-constants';

export const KEYS = {
  baseUrl: 'gateway.baseUrl',
  token: 'gateway.token',
  thinking: 'gateway.thinking',
  pendingRunPrefix: 'xopc:pendingRun:',
  language: 'prefs.language',
  themePreference: 'prefs.themePreference',
} as const;

export type KeyValueStorage = {
  getString(key: string): string | undefined;
  set(key: string, value: string | number | boolean): void;
  delete(key: string): void;
};

type MMKVInstance = import('react-native-mmkv').MMKV;

let mmkv: MMKVInstance | null = null;
/** True after a failed native load (e.g. Expo Go without NitroModules). */
let nativeUnavailable = false;
const memory = new Map<string, string>();

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function getNativeMmkv(): MMKVInstance | null {
  if (mmkv) return mmkv;
  if (nativeUnavailable) return null;
  // Never load MMKV in Expo Go: the Nitro native module is not in the client, and
  // native failures are not always catchable from JS.
  if (isExpoGo()) {
    nativeUnavailable = true;
    return null;
  }
  try {
    // Lazy require so the bundle loads in Expo Go (we return above before this runs).
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional deferred native load
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    mmkv = createMMKV({ id: 'xopc-mobile' });
    return mmkv;
  } catch {
    nativeUnavailable = true;
    return null;
  }
}

export const storage: KeyValueStorage = {
  getString(key: string) {
    const native = getNativeMmkv();
    if (native) return native.getString(key);
    return memory.get(key);
  },
  set(key: string, value: string | number | boolean) {
    const native = getNativeMmkv();
    if (native) native.set(key, value);
    else memory.set(key, String(value));
  },
  delete(key: string) {
    const native = getNativeMmkv();
    if (native) native.remove(key);
    else memory.delete(key);
  },
};

export function pendingRunStorageKey(chatId: string): string {
  return `${KEYS.pendingRunPrefix}${chatId}`;
}
