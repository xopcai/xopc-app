import { AppState, type AppStateStatus } from 'react-native';

import { apiFetch } from '../../api/client';
import { useGatewayStore } from '../../stores/gateway-store';

/**
 * Periodically ping gateway /health; marks offline after consecutive failures.
 */
export class GatewayHealthMonitor {
  private intervalId?: ReturnType<typeof setInterval>;
  private appStateSub?: { remove: () => void };
  private stopTimer?: ReturnType<typeof setTimeout>;
  private checkInFlight: Promise<boolean> | null = null;
  private consecutiveFailures = 0;
  private online = true;
  private readonly maxFailures = 3;
  private readonly intervalMs = 30_000;
  private readonly timeoutMs = 5_000;
  private readonly listeners = new Set<(online: boolean) => void>();

  subscribe(onStatusChange: (online: boolean) => void): () => void {
    this.listeners.add(onStatusChange);
    onStatusChange(this.online);
    this.startIfNeeded();

    return () => {
      this.listeners.delete(onStatusChange);
      if (this.listeners.size === 0) this.scheduleStop();
    };
  }

  private startIfNeeded(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = undefined;
    }
    if (this.intervalId || this.appStateSub) return;

    void this.updateStatus();
    this.intervalId = setInterval(() => void this.updateStatus(), this.intervalMs);
    this.appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void this.updateStatus();
    });
  }

  private scheduleStop(): void {
    if (this.stopTimer) return;
    this.stopTimer = setTimeout(() => {
      this.stopTimer = undefined;
      if (this.listeners.size === 0) this.stop();
    }, 250);
  }

  private stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.appStateSub?.remove();
    this.appStateSub = undefined;
    this.consecutiveFailures = 0;
    this.checkInFlight = null;
  }

  private emit(online: boolean): void {
    this.online = online;
    for (const listener of this.listeners) {
      listener(online);
    }
  }

  private async updateStatus(): Promise<void> {
    const ok = await this.checkNow();
    if (ok) {
      if (!this.online || this.consecutiveFailures >= this.maxFailures) {
        this.emit(true);
      }
      this.consecutiveFailures = 0;
      return;
    }

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.maxFailures && this.online) {
      this.emit(false);
    }
  }

  async checkNow(): Promise<boolean> {
    if (this.checkInFlight) return this.checkInFlight;

    this.checkInFlight = this.runHealthCheck().finally(() => {
      this.checkInFlight = null;
    });
    return this.checkInFlight;
  }

  private async runHealthCheck(): Promise<boolean> {
    const { baseUrl, activeBaseUrl, token } = useGatewayStore.getState();
    if (!baseUrl.trim() && !activeBaseUrl.trim()) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await apiFetch('/health', { signal: controller.signal, headers });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}

let sharedMonitor: GatewayHealthMonitor | null = null;

export function getGatewayHealthMonitor(): GatewayHealthMonitor {
  if (!sharedMonitor) sharedMonitor = new GatewayHealthMonitor();
  return sharedMonitor;
}
