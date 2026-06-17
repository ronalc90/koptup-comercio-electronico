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
    // Forzamos NODE_ENV=test para que el runner sea determinista sin importar el
    // entorno desde el que se invoque el gate. Sin esto, módulos con lógica de
    // boot por entorno (p. ej. el fail-fast de AUTH_SECRET en producción) podrían
    // dispararse durante los tests si el shell exporta NODE_ENV=production.
    env: { NODE_ENV: 'test' },
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
