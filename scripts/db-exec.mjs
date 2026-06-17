#!/usr/bin/env node
/**
 * Ejecuta SQL (incluido DDL) en la BD de Supabase vía la Management API.
 *
 * El service role key NO puede correr DDL; este script usa el Personal Access
 * Token (`SUPABASE_ACCESS_TOKEN`, formato sbp_...) que SÍ puede.
 *
 * Uso:
 *   node scripts/db-exec.mjs migrations/002_multi_tenant.sql   # corre un archivo
 *   node scripts/db-exec.mjs --sql "select 1"                  # corre SQL inline
 *
 * Lee credenciales de .env.local. NUNCA imprime el token.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Carga simple de .env.local (sin dependencias).
function loadEnv() {
  const p = join(root, '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const refMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/);
const ref = process.env.SUPABASE_PROJECT_REF || (refMatch ? refMatch[1] : null);

if (!token) { console.error('Falta SUPABASE_ACCESS_TOKEN en .env.local'); process.exit(1); }
if (!ref) { console.error('No pude derivar el project ref de NEXT_PUBLIC_SUPABASE_URL'); process.exit(1); }

const args = process.argv.slice(2);
let sql;
if (args[0] === '--sql') sql = args.slice(1).join(' ');
else if (args[0]) sql = readFileSync(join(root, args[0]), 'utf8');
else { console.error('Pasá un archivo .sql o --sql "..."'); process.exit(1); }

const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

const res = await fetch(endpoint, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`✗ HTTP ${res.status}`);
  console.error(text);
  process.exit(1);
}
console.log(`✓ OK (HTTP ${res.status})`);
try {
  const json = JSON.parse(text);
  console.log(JSON.stringify(json, null, 2));
} catch {
  console.log(text);
}
