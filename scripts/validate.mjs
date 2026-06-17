#!/usr/bin/env node
/**
 * Gate de validación pre-despliegue.
 *
 * Implementa el "SISTEMA DE VALIDACIÓN" de la plataforma: ninguna entrega debe
 * desplegarse si falla alguna comprobación. Cubre:
 *   1. typecheck            (tsc --noEmit)
 *   2. lint                 (eslint, falla solo con errores)
 *   3. unit tests           (vitest run)
 *   4. migraciones          (estructura multi-tenant presente y coherente)
 *   5. políticas seguridad  (RLS declarada; sin secretos hardcodeados nuevos)
 *   6. aislamiento tenant    (rutas API acotadas; TENANT_TABLES coherente)
 *   7. e2e                   (opcional, con --e2e: playwright test)
 *
 * Uso:  node scripts/validate.mjs [--e2e] [--skip-tests]
 * Sale con código !=0 si alguna comprobación falla.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const want = (flag) => args.includes(flag);

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✗ FAIL\x1b[0m';
  console.log(`${tag}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function run(name, cmd) {
  process.stdout.write(`\x1b[2m… ${name}\x1b[0m\n`);
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe' });
    record(name, true);
  } catch (e) {
    const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    record(name, false, out.trim().split('\n').slice(-12).join('\n'));
  }
}

function read(rel) {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

console.log('\n🔒 Gate de validación multi-tenant\n');

// 1. Typecheck
run('1. typecheck', 'npx tsc --noEmit');

// 2. Lint (eslint sale !=0 con errores; los warnings no bloquean)
run('2. lint', 'npx eslint');

// 3. Unit tests
if (!want('--skip-tests')) run('3. unit tests', 'npx vitest run');
else record('3. unit tests', true, 'omitido (--skip-tests)');

// 4. Migraciones multi-tenant
(() => {
  const mig = read('migrations/002_multi_tenant.sql');
  if (!mig) return record('4. migraciones', false, 'falta 002_multi_tenant.sql');
  const needs = [
    ['tabla tenants', /CREATE TABLE IF NOT EXISTS tenants/],
    ['tabla users', /CREATE TABLE IF NOT EXISTS users/],
    ['columna tenant_id', /ADD COLUMN IF NOT EXISTS tenant_id/],
    ['backfill', /SET tenant_id = 1/],
    ['seed meraki', /'meraki'/],
    ['seed primeramayo', /'primeramayo'/],
  ];
  const fails = needs.filter(([, re]) => !re.test(mig)).map(([n]) => n);
  record('4. migraciones', fails.length === 0, fails.length ? `falta: ${fails.join(', ')}` : 'estructura completa');
})();

// 5. Políticas de seguridad
(() => {
  const schema = read('supabase-schema.sql') || '';
  const mig = read('migrations/002_multi_tenant.sql') || '';
  const rls = /ENABLE ROW LEVEL SECURITY/.test(schema) && /ENABLE ROW LEVEL SECURITY/.test(mig);
  // No deben aparecer claves de servicio embebidas en código fuente, ni el
  // secreto de sesión por defecto 'fallback-secret' (debilita la firma HS256).
  let leaked = [];
  let fallbackSecret = [];
  const scan = (dir) => {
    for (const f of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = join(dir, f.name);
      if (f.isDirectory()) { if (!/node_modules|\.next/.test(f.name)) scan(rel); continue; }
      if (!/\.(ts|tsx|mjs|js)$/.test(f.name)) continue;
      const c = readFileSync(join(root, rel), 'utf8');
      if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(c) || /sbp_[a-f0-9]{40}/.test(c)) leaked.push(rel);
      if (c.includes('fallback-secret')) fallbackSecret.push(rel);
    }
  };
  scan('src');
  // AUTH_SECRET debe estar documentada como requerida en .env.example.
  const envExample = read('.env.example') || '';
  const authSecretDocumented = /AUTH_SECRET\s*=/.test(envExample);
  const problems = [];
  if (!rls) problems.push('RLS no declarada');
  if (leaked.length) problems.push(`posible secreto en: ${leaked.join(', ')}`);
  if (fallbackSecret.length) problems.push(`'fallback-secret' presente en: ${fallbackSecret.join(', ')}`);
  if (!authSecretDocumented) problems.push('AUTH_SECRET no documentada en .env.example');
  record('5. políticas seguridad', problems.length === 0,
    problems.length ? problems.join('; ') : 'RLS + sin secretos + AUTH_SECRET documentada');
})();

// 6. Aislamiento multi-tenant
(() => {
  const tenant = read('src/lib/tenant.ts') || '';
  const tablesOk = ['products', 'orders', 'inventory', 'settings', 'expenses']
    .every((t) => tenant.includes(`'${t}'`));
  // Ninguna ruta API (salvo migrate) debe usar getServiceClient() directo: deben
  // pasar por la capa acotada (getRequestScopedClient / getScopedServiceClient).
  const offenders = [];
  const apiDir = join(root, 'src/app/api');
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (f.name !== 'route.ts') continue;
      const rel = p.replace(root + '/', '');
      // Permitidos: migrate (DDL); api/admin y api/billing (gestionan
      // users/tenants/charges —no son tablas del guard— filtrando tenant_id con
      // doble .eq); api/superadmin (única superficie cross-tenant legítima,
      // gateada por requireSuperadmin).
      if (rel.includes('api/migrate') || rel.includes('api/admin')
        || rel.includes('api/superadmin') || rel.includes('api/billing')) continue;
      const c = readFileSync(p, 'utf8');
      if (/getServiceClient\s*\(/.test(c)) offenders.push(rel);
    }
  };
  walk(apiDir);
  record('6. aislamiento tenant', tablesOk && offenders.length === 0,
    !tablesOk ? 'TENANT_TABLES incompleto' : offenders.length ? `usan service client sin acotar: ${offenders.join(', ')}` : 'rutas acotadas; TENANT_TABLES ok');
})();

// 7. E2E (opcional)
if (want('--e2e')) run('7. e2e', 'npx playwright test');
else record('7. e2e', true, 'omitido (usar --e2e)');

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length) {
  console.log(`\x1b[31m✗ Gate FALLÓ: ${failed.length} comprobación(es).\x1b[0m No desplegar.\n`);
  process.exit(1);
}
console.log('\x1b[32m✓ Gate OK: seguro para desplegar.\x1b[0m\n');
