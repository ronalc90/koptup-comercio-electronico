import { describe, it, expect } from 'vitest';
import {
  slugify,
  isValidEmail,
  isKnownIndustry,
  defaultCategoriesForIndustry,
  sanitizeCategories,
  validateBusinessRegistration,
  validateInviteRegistration,
  INDUSTRY_KEYS,
} from './registration';

describe('slugify', () => {
  it('normaliza acentos, espacios y símbolos', () => {
    expect(slugify('Tienda La Esquiná!! #2')).toBe('tienda-la-esquina-2');
    expect(slugify('  Motos & Más  ')).toBe('motos-mas');
  });
  it('recorta a 40 chars y sin guiones colgantes', () => {
    expect(slugify('---hola---')).toBe('hola');
    expect(slugify('a'.repeat(60)).length).toBeLessThanOrEqual(40);
  });
});

describe('isValidEmail', () => {
  it('acepta válidos y rechaza inválidos', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('sin-arroba')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

describe('industrias y categorías', () => {
  it('reconoce industrias del catálogo', () => {
    expect(isKnownIndustry('motos')).toBe(true);
    expect(isKnownIndustry('inexistente')).toBe(false);
    expect(INDUSTRY_KEYS).toContain('otro');
  });
  it('categorías por defecto por industria; otro = genérico', () => {
    expect(defaultCategoriesForIndustry('motos')).toContain('Cascos');
    expect(defaultCategoriesForIndustry('desconocida')).toEqual(['General', 'Otro']);
  });
  it('sanitizeCategories: limpia, recorta, dedupe', () => {
    expect(sanitizeCategories(['  Cascos ', 'cascos', 'Repuestos', 42, ''])).toEqual(['Cascos', 'Repuestos']);
    expect(sanitizeCategories('no-array')).toEqual([]);
    expect(sanitizeCategories(Array(50).fill('x').map((_, i) => `c${i}`)).length).toBe(40);
  });
});

describe('validateBusinessRegistration (modo A)', () => {
  const ok = {
    businessName: 'Mi Negocio', industry: 'motos', contactEmail: 'c@n.co',
    phone: '3001234567', adminName: 'Ronald', adminEmail: 'a@n.co', acceptedTerms: true,
  };
  it('válido → null', () => expect(validateBusinessRegistration(ok)).toBeNull());
  it('nombre faltante', () => expect(validateBusinessRegistration({ ...ok, businessName: '' })).toMatch(/nombre del negocio/i));
  it('industria inválida', () => expect(validateBusinessRegistration({ ...ok, industry: 'x' })).toMatch(/tipo de negocio/i));
  it('email contacto inválido', () => expect(validateBusinessRegistration({ ...ok, contactEmail: 'x' })).toMatch(/email de contacto/i));
  it('sin teléfono', () => expect(validateBusinessRegistration({ ...ok, phone: '' })).toMatch(/teléfono/i));
  it('admin email inválido', () => expect(validateBusinessRegistration({ ...ok, adminEmail: 'x' })).toMatch(/administrador/i));
  it('términos no aceptados', () => expect(validateBusinessRegistration({ ...ok, acceptedTerms: false })).toMatch(/términos/i));
});

describe('validateInviteRegistration (modo B)', () => {
  const ok = { inviteCode: 'ABCD1234', name: 'Pedro', email: 'p@n.co', acceptedTerms: true };
  it('válido → null', () => expect(validateInviteRegistration(ok)).toBeNull());
  it('sin código', () => expect(validateInviteRegistration({ ...ok, inviteCode: '' })).toMatch(/código de invitación/i));
  it('nombre faltante', () => expect(validateInviteRegistration({ ...ok, name: '' })).toMatch(/nombre/i));
  it('email inválido', () => expect(validateInviteRegistration({ ...ok, email: 'x' })).toMatch(/email/i));
  it('términos', () => expect(validateInviteRegistration({ ...ok, acceptedTerms: false })).toMatch(/términos/i));
});
