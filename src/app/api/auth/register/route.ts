import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { hashPassword, validatePassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rateLimit';
import {
  slugify,
  sanitizeCategories,
  defaultCategoriesForIndustry,
  validateBusinessRegistration,
  validateInviteRegistration,
  INDUSTRY_PRESETS,
} from '@/lib/registration';

export const dynamic = 'force-dynamic';

// Registro público → más estricto que login (es pre-auth y crea filas).
const MAX = 5;
const WINDOW_MS = 10 * 60 * 1000;

function clientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  return request.headers.get('x-real-ip')?.trim() || xff?.split(',').pop()?.trim() || 'unknown';
}

/**
 * Auto-registro. NUNCA inicia sesión: deja al usuario en estado 'pending'.
 *   - Modo B (con inviteCode): crea un usuario member pendiente en el negocio
 *     dueño del código. Lo aprueba el ADMIN de ese negocio.
 *   - Modo A (sin inviteCode): crea un negocio nuevo (tenant inactivo,
 *     source='self_signup') + su usuario admin pendiente. Lo aprueba el SUPERADMIN.
 */
export async function POST(request: NextRequest) {
  const rl = rateLimit(`register:${clientIp(request)}`, MAX, WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Demasiados intentos. Espera ${rl.retryAfterSec}s e intenta de nuevo.` },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const db = getServiceClient();

  // ── Modo B: unirse a un negocio existente por código de invitación ──────────
  if (body.inviteCode) {
    const err = validateInviteRegistration(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const pwdErr = validatePassword(body.password ?? '');
    if (pwdErr) return NextResponse.json({ error: pwdErr }, { status: 400 });

    const code = String(body.inviteCode).trim();
    const { data: tenant, error: tErr } = await db
      .from('tenants').select('id, active').eq('invite_code', code).maybeSingle();
    if (tErr) {
      console.error('register modo B buscar invite:', tErr.message);
      return NextResponse.json({ error: 'No se pudo validar la invitación' }, { status: 500 });
    }
    if (!tenant || tenant.active === false) {
      return NextResponse.json({ error: 'Código de invitación inválido' }, { status: 400 });
    }

    const email = String(body.email).trim().toLowerCase();
    const { error: uErr } = await db.from('users').insert({
      tenant_id: tenant.id,
      email,
      username: String(body.name).trim() || email,
      password_hash: await hashPassword(body.password),
      role: 'member',
      status: 'pending',
      active: false,
    });
    if (uErr) {
      const conflict = (uErr as { code?: string }).code === '23505';
      if (!conflict) console.error('register modo B insert user:', uErr.message);
      return NextResponse.json(
        { error: conflict ? 'Ya existe una cuenta con ese email en este negocio' : 'No se pudo registrar' },
        { status: conflict ? 409 : 500 },
      );
    }
    await recordAudit(db, {
      tenantId: tenant.id,
      actor: { userId: null, username: email, role: 'member' },
      action: 'registration_requested',
      entity: 'user',
      detail: { mode: 'invite', email },
    });
    return NextResponse.json({ success: true, mode: 'invite' }, { status: 201 });
  }

  // ── Modo A: negocio nuevo (tenant prospecto + admin pendiente) ──────────────
  const err = validateBusinessRegistration(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const pwdErr = validatePassword(body.adminPassword ?? '');
  if (pwdErr) return NextResponse.json({ error: pwdErr }, { status: 400 });

  const industry = String(body.industry);
  const categories = sanitizeCategories(body.categories);
  const config = {
    categories: categories.length ? categories : defaultCategoriesForIndustry(industry),
    phone: String(body.phone).trim(),
    ai: { domain: (INDUSTRY_PRESETS[industry]?.label ?? 'productos y pedidos').toLowerCase() },
  };

  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .insert({
      name: String(body.businessName).trim(),
      slug: slugify(String(body.businessName)),
      industry,
      logo: '🏪',
      plan: 'free',
      billing_status: 'trial',
      active: false,
      source: 'self_signup',
      config,
    })
    .select('id')
    .single();
  if (tErr || !tenant) {
    const conflict = (tErr as { code?: string })?.code === '23505';
    if (!conflict) console.error('register modo A crear tenant:', tErr?.message);
    return NextResponse.json(
      { error: conflict ? 'Ese nombre de negocio ya está en uso, prueba otro' : 'No se pudo registrar el negocio' },
      { status: conflict ? 409 : 500 },
    );
  }

  const adminEmail = String(body.adminEmail).trim().toLowerCase();
  const { error: uErr } = await db.from('users').insert({
    tenant_id: tenant.id,
    email: adminEmail,
    username: String(body.adminName).trim() || adminEmail,
    password_hash: await hashPassword(body.adminPassword),
    role: 'admin',
    status: 'pending',
    active: false,
  });
  if (uErr) {
    // Rollback best-effort: sin admin el tenant queda huérfano.
    await db.from('tenants').delete().eq('id', tenant.id);
    console.error('register modo A crear admin:', uErr.message);
    return NextResponse.json({ error: 'No se pudo crear el administrador del negocio' }, { status: 500 });
  }
  await recordAudit(db, {
    tenantId: tenant.id,
    actor: { userId: null, username: adminEmail, role: 'admin' },
    action: 'registration_requested',
    entity: 'tenant',
    entityId: tenant.id,
    detail: { mode: 'business', businessName: body.businessName, industry, adminEmail },
  });
  return NextResponse.json({ success: true, mode: 'business' }, { status: 201 });
}
