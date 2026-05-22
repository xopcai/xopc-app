import { describe, expect, it } from 'vitest';

import { resolveActiveGatewayDisplay } from '../active-gateway-display';
import type { GatewayProfile } from '../../../stores/gateway-types';

const profile: GatewayProfile = {
  id: 'p1',
  name: 'Home Lab',
  baseUrl: 'https://gw.example.com',
  lanUrl: null,
  token: 't',
  updatedAt: 1,
};

describe('resolveActiveGatewayDisplay', () => {
  it('returns profile name when set', () => {
    expect(resolveActiveGatewayDisplay(profile, 'https://gw.example.com')).toEqual({
      name: 'Home Lab',
      configured: true,
      profileId: 'p1',
    });
  });

  it('falls back to hostname when name is empty', () => {
    expect(
      resolveActiveGatewayDisplay(
        { ...profile, name: '', baseUrl: 'https://my-gateway.example.com:18790' },
        'https://my-gateway.example.com:18790',
      ),
    ).toEqual({
      name: 'my-gateway.example.com',
      configured: true,
      profileId: 'p1',
    });
  });

  it('returns unconfigured when baseUrl is empty', () => {
    expect(resolveActiveGatewayDisplay(null, '')).toEqual({
      name: '',
      configured: false,
      profileId: null,
    });
  });
});
