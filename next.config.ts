import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Cabeceras de seguridad (todas las rutas: páginas, API y estáticos).
// ---------------------------------------------------------------------------

/**
 * Orígenes de Supabase a los que el NAVEGADOR habla directo (las páginas cliente
 * usan el cliente de Supabase con la anon key). Sale de la misma variable que
 * Next incrusta en el bundle al compilar, así que build y CSP no se desincronizan.
 */
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    const ws = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${ws}//${url.host}`];
  } catch {
    return [];
  }
}

const isDev = process.env.NODE_ENV === "development";

// Política COMPLETA, hoy en modo Report-Only: el navegador la evalúa y reporta
// en la consola lo que bloquearía, pero no bloquea nada. Motivos:
//  - Sin nonces, script-src necesita 'unsafe-inline' (Next inyecta scripts
//    inline al hidratar); con nonces habría que renderizar TODAS las páginas de
//    forma dinámica. Aplicarla protegería poco contra XSS y arriesga romper
//    flujos que no se pueden probar sin datos reales (Storage, imágenes de
//    terceros, la barra de Vercel en previews).
//  - style-src necesita 'unsafe-inline': react-hot-toast inyecta <style> y
//    React/Recharts usan atributos style.
// Cuando la consola de producción no muestre violaciones, basta con renombrar
// la cabecera a Content-Security-Policy para aplicarla.
const cspReportOnly = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Fotos de productos/logos: Storage de Supabase, URLs https que pega el
  // usuario, data: (logo/QR) y blob: (vista previa de la cámara).
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  ["connect-src 'self'", ...supabaseOrigins()].join(" "),
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Parte que SÍ se aplica ya: no restringe ningún recurso que cargue la app
// (no hay iframes, <object>, <base> ni formularios hacia otros orígenes), así
// que no puede romperla, y cierra clickjacking e inyección de <base>/<object>.
const cspEnforced = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Equivalente legado de frame-ancestors 'none' (navegadores viejos).
  { key: "X-Frame-Options", value: "DENY" },
  // Cámara (fotos de productos) y micrófono (dictado por voz) solo para la
  // propia app; el resto de APIs sensibles, para nadie.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
  // 2 años, sin `preload` (eso es un compromiso con la lista de los navegadores
  // que conviene decidir aparte). Por HTTP (localhost) el navegador la ignora.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: cspEnforced },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['exceljs'],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
