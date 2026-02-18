import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      vscode: path.resolve(__dirname, 'src/__mocks__/vscode.ts'),
    },
  },
  resolve: {
    alias: {
      '@marcelia/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
