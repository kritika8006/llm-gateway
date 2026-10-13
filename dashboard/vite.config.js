import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, forward API calls to the gateway so `npm run dev` works against `docker compose up`.
export default defineConfig({ plugins: [react()], server: { proxy: { '/v1': 'http://localhost:3000' } } });