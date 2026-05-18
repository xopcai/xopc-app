import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/gateway-sse-client/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
  },
});
