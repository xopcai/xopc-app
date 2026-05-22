import { describe, expect, it } from 'vitest';

import {
  preferredActiveBaseUrlFromFlat,
  resolveEffectiveGatewayBaseUrl,
} from '../gateway-types';

describe('resolveEffectiveGatewayBaseUrl', () => {
  it('prefers activeBaseUrl, then baseUrl, then lanUrl', () => {
    expect(
      resolveEffectiveGatewayBaseUrl({
        activeBaseUrl: 'http://192.168.1.44:18790',
        baseUrl: 'https://frp.example.com',
        lanUrl: 'http://10.0.0.2:18790',
      }),
    ).toBe('http://192.168.1.44:18790');

    expect(
      resolveEffectiveGatewayBaseUrl({
        activeBaseUrl: '',
        baseUrl: 'https://frp.example.com',
        lanUrl: 'http://192.168.1.44:18790',
      }),
    ).toBe('https://frp.example.com');

    expect(
      resolveEffectiveGatewayBaseUrl({
        activeBaseUrl: '',
        baseUrl: '',
        lanUrl: '192.168.1.44:18790',
      }),
    ).toBe('http://192.168.1.44:18790');
  });
});

describe('preferredActiveBaseUrlFromFlat', () => {
  it('prefers LAN over tunnel for optimistic routing', () => {
    expect(
      preferredActiveBaseUrlFromFlat({
        baseUrl: 'https://frp.example.com',
        lanUrl: 'http://192.168.1.44:18790',
      }),
    ).toBe('http://192.168.1.44:18790');
  });
});
