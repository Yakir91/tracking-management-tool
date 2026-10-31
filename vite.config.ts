import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works under /tracking-management-tool/ on GitHub Pages and from any folder.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
} as any);
