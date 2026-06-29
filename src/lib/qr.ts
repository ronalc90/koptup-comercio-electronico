import QRCode from 'qrcode';

/**
 * Genera un QR como SVG (string). Funciona en servidor y navegador sin canvas,
 * así que sirve tanto para el catálogo público (server component) como para el
 * recibo imprimible (client). `text` suele ser la URL del catálogo del tenant.
 */
export async function qrSvg(text: string, opts?: { width?: number; margin?: number }): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    margin: opts?.margin ?? 1,
    width: opts?.width ?? 160,
    errorCorrectionLevel: 'M',
  });
}

/** Ruta (relativa) del catálogo público de un tenant. */
export function catalogPath(slug: string): string {
  return `/catalog/${encodeURIComponent(slug)}`;
}

/** URL absoluta del catálogo. `origin` p. ej. https://koptup-comercio-electronico.vercel.app */
export function catalogUrl(slug: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}${catalogPath(slug)}`;
}
