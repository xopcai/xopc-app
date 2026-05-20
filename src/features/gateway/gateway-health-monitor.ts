import { AppState, type AppStateStatus } from 'react-native';

import { apiFetch } from '../../api/client';
import { useGatewayStore } from '../../stores/gateway-store';

/**
 * Periodically ping gateway /health; marks offline after consecutive failures.
 */
export class GatewayHealthMonitor {
  private intervalId?: ReturnType<typeof setInterval>;
  private appStateSub?: { remove: () => void };
  private consecutiveFailures = 0;
  private readonly maxFailures = 3;
  private readonly intervalMs = 30_000;
  private readonly timeoutMs = 5_000;
  private onStatusChange: ((online: boolean) => void) | null = null;

  start(onStatusChange: (online: boolean) => void): void {
    this.stop();
    this.onStatusChange = onStatusChange;
    const check = async () => {
      const ok = await this.checkNow();
      if (ok) {
        if (this.consecutiveFailures >= this.maxFailures) {
          this.onStatusChange?.(true);
        }
        this.consecutiveFailures = 0;
      } else {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= this.maxFailures) {
          this.onStatusChange?.(false);
        }
      }
    };
    void check();
    this.intervalId = setInterval(() => void check(), this.intervalMs);
    this.appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void check();
    });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.appStateSub?.remove();
    this.appStateSub = undefined;
    this.consecutiveFailures = 0;
    this.onStatusChange = null;
  }

  async checkNow(): Promise<boolean> {
    const { baseUrl, token } = useGatewayStore.getState();
    if (!baseUrl.trim()) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await apiFetch('/health', { signal: controller.signal, headers });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }
}

let sharedMonitor: GatewayHealthMonitor | null = null;

export function getGatewayHealthMonitor(): GatewayHealthMonitor {
  if (!sharedMonitor) sharedMonitor = new GatewayHealthMonitor();
  return sharedMonitor;
}
