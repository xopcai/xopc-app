import { describe, expect, it } from 'vitest';

import { hasPairableGatewayQr, parseGatewayQrPayload } from '../parse-gateway-qr';

describe('parseGatewayQrPayload', () => {
  it('parses mobile-connect deep link with ps', () => {
    const raw =
      'xopc://gateway/mobile-connect?baseUrl=https%3A%2F%2Fabc123.frp.xopc.ai&lanUrl=http%3A%2F%2F192.168.1.10%3A18790&ps=one-time-secret';
    const parsed = parseGatewayQrPayload(raw);
    expect(parsed.baseUrl).toBe('https://abc123.frp.xopc.ai');
    expect(parsed.lanUrl).toBe('http://192.168.1.10:18790');
    expect(parsed.pairingSecret).toBe('one-time-secret');
    expect(parsed.token).toBeUndefined();
  });

  it('still parses legacy token deep links', () => {
    const raw = 'xopc://gateway/mobile-connect?baseUrl=https%3A%2F%2Flocal&token=legacy-token';
    const parsed = parseGatewayQrPayload(raw);
    expect(parsed.baseUrl).toBe('https://local');
    expect(parsed.token).toBe('legacy-token');
    expect(parsed.pairingSecret).toBeUndefined();
  });

  it('prefers ps over token when both present', () => {
    const raw = 'xopc://gateway/mobile-connect?baseUrl=https%3A%2F%2Flocal&ps=ps1&token=t1';
    const parsed = parseGatewayQrPayload(raw);
    expect(parsed.pairingSecret).toBe('ps1');
    expect(parsed.token).toBeUndefined();
  });
});

describe('hasPairableGatewayQr', () => {
  it('accepts pairing secret with baseUrl', () => {
    expect(hasPairableGatewayQr({ baseUrl: 'https://a', pairingSecret: 'ps' })).toBe(true);
  });

  it('rejects pairing secret without baseUrl', () => {
    expect(hasPairableGatewayQr({ pairingSecret: 'ps' })).toBe(false);
  });
});
