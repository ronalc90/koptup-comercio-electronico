# Política de seguridad

## Versiones soportadas

Solo la rama `main` recibe correcciones de seguridad: es la que está desplegada en Vercel ([koptup-comercio-electronico.vercel.app](https://koptup-comercio-electronico.vercel.app)). Las demás ramas y los commits anteriores no tienen soporte.

| Versión | Soporte |
| --- | --- |
| `main` (desplegada) | Sí |
| Otras ramas y commits anteriores | No |

## Cómo reportar una vulnerabilidad

Escribe en privado a **ronalddemiancipagauta@gmail.com** con el asunto `[Seguridad] koptup-comercio-electronico: <resumen breve>`.

**No abras issues, discusiones ni pull requests públicos para reportar una vulnerabilidad**: la dejarían a la vista antes de que exista una corrección.

Incluye en el reporte:

- Qué parte está afectada: URL, ruta de la API, tabla, archivo o commit.
- Tipo de problema e impacto posible (por ejemplo, leer datos de otro negocio, saltarse un rol o falsificar una sesión).
- Pasos para reproducirlo o una prueba de concepto mínima.
- El commit de `main` o la fecha en que lo probaste, y el navegador o entorno si aplica.

Prueba solo con un negocio y cuentas propios o de prueba: no accedas a datos de otros negocios, no los cambies ni los borres, y no degrades el servicio.

## Plazos orientativos

- **Acuse de recibo:** dentro de 72 horas.
- **Evaluación inicial** (si se confirma y qué gravedad tiene): dentro de 7 días.

Luego recibirás el plan de corrección y un aviso cuando esté desplegada. Te pido no divulgar el problema hasta entonces.

## Medidas actuales

Cada negocio queda aislado por `tenant_id` en la app (`withTenant`) y en Supabase con RLS estricta (migración 003), y `npm run validate` revisa antes de desplegar que la RLS esté declarada y que no haya secretos en el código.

---

## Summary (English)

Only the `main` branch (the deployed one) receives security fixes. Report vulnerabilities privately to **ronalddemiancipagauta@gmail.com**. Please do not open public issues, discussions or pull requests for them. Include the affected component, the impact, steps to reproduce or a minimal proof of concept, and the commit or date you tested. Use only your own or test business and accounts. You can expect an acknowledgement within 72 hours and an initial assessment within 7 days.
