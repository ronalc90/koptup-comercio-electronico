import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // Desactivamos el descubrimiento automático de PostCSS. Los unit tests
  // de este proyecto sólo ejercitan funciones puras en /lib y no necesitan
  // resolver estilos; esto evita tener que instalar el native binding de
  // @tailwindcss/postcss / lightningcss en entornos de test.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // E2E vive en /tests y usa Playwright — no Vitest.
    exclude: ['node_modules/**', 'dist/**', 'tests/**', '.next/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
