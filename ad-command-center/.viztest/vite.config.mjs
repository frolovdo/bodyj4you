import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ root: '.viztest', plugins: [react()], build: { outDir: 'dist', emptyOutDir: true }, base: './' });
