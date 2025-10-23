import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  build: {
    outDir: 'build'
  },
  plugins: [react()],
  server: {
    port: 5000,
    open: true
  }
});
