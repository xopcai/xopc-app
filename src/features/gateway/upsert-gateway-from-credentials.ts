import type { PairGatewayResult } from './pair-gateway';
import { syncAfterGatewaySettingsSave } from './gateway-connection-sync';
import {
  applyGatewayUpsert,
  type GatewayCredentials,
  type UpsertGatewayResult,
} from './upsert-gateway-core';
import { useGatewayStore } from '../../stores/gateway-store';

export type { GatewayCredentials, UpsertGatewayResult };

/**
 * Add a new gateway profile or update an existing one (matched by baseUrl), then switch to it.
 */
export async function upsertGatewayFromCredentials(
  credentials: GatewayCredentials,
): Promise<UpsertGatewayResult> {
  const result = applyGatewayUpsert(useGatewayStore.getState(), credentials);
  await syncAfterGatewaySettingsSave();
  return result;
}

export async function upsertGatewayFromPairResult(result: PairGatewayResult): Promise<UpsertGatewayResult> {
  return upsertGatewayFromCredentials({
    baseUrl: result.baseUrl,
    lanUrl: result.lanUrl,
    token: result.token,
  });
}
