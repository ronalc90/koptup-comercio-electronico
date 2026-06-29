/**
 * Cifrado de credenciales de transportadora (SOLO servidor). AES-256-GCM con la
 * clave `SHIPPING_ENC_KEY` (hex de 64 chars / 32 bytes, o cualquier texto: se
 * deriva por SHA-256). Las credenciales del carrier NUNCA se guardan en claro en
 * la BD: se cifran con esto antes de escribir `tenants.shipping_config.credentials`
 * y se descifran solo aquí, en el servidor, al crear guías.
 *
 * Formato del blob: base64(iv).base64(authTag).base64(ciphertext).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function key(): Buffer {
  const raw = process.env.SHIPPING_ENC_KEY || '';
  if (!raw) throw new Error('SHIPPING_ENC_KEY no está definida (requerida para cifrar credenciales de envío)');
  // Deriva 32 bytes con SHA-256 (acepta hex o cualquier passphrase).
  return createHash('sha256').update(raw).digest();
}

export function isShippingCryptoConfigured(): boolean {
  return Boolean(process.env.SHIPPING_ENC_KEY);
}

export function encryptCredentials(plain: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`;
}

export function decryptCredentials<T = unknown>(blob: string): T {
  const [ivB64, tagB64, dataB64] = String(blob).split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Blob de credenciales inválido');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return JSON.parse(out.toString('utf8')) as T;
}
