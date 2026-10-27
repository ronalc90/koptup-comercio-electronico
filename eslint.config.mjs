import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Permite el idioma de "omitir" campos en un destructuring con prefijo `_`
  // (p. ej. `const { id: _id, created_at: _ca, ...rest } = row`) sin warning.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  // eslint-plugin-react-hooks 7.1 (requerido por eslint-config-next 16.4) hace un
  // análisis más estricto del React Compiler y marca casos en código existente
  // que la 7.0 no detectaba. Se dejan como warning para no bloquear la
  // actualización de seguridad; pendiente corregirlos y volver a "error".
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Testing artifacts
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
