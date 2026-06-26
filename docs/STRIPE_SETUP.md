# Pagos con Stripe — guía de conexión

La app ya trae la integración de Stripe (suscripción mensual de licencias). Está
**desactivada** hasta que conectes tu cuenta: sin llaves, el botón de pago no
aparece y todo lo demás funciona igual. Empieza **siempre en modo PRUEBA** (no
mueve dinero real) y pásate a producción cuando lo verifiques.

## 1. Crear la cuenta de Stripe
1. Entra a https://dashboard.stripe.com/register y crea la cuenta (país: Colombia).
2. Quédate en **modo Test** (interruptor "Test mode" arriba a la derecha).

## 2. Crear los productos y precios (uno por plan de pago)
En **Productos → Add product**, crea 2 productos con precio **recurrente mensual** en **COP**:
- **Pro** — $49.900 COP / mes  → copia el **Price ID** (empieza con `price_...`).
- **Enterprise** — $149.900 COP / mes → copia su **Price ID**.

(El plan Free no se cobra.)

## 3. Obtener las llaves (modo Test)
En **Developers → API keys**:
- **Secret key** → `sk_test_...`
- (La publishable `pk_test_...` no es necesaria: usamos Checkout alojado por Stripe.)

## 4. Configurar el webhook
En **Developers → Webhooks → Add endpoint**:
- URL: `https://meraki-app.vercel.app/api/billing/webhook`
- Eventos: `invoice.paid`, `invoice.payment_failed`, `checkout.session.completed`, `customer.subscription.deleted`
- Copia el **Signing secret** → `whsec_...`

## 5. Poner las variables en Vercel
En **Vercel → proyecto → Settings → Environment Variables** (target: Production):
```
STRIPE_SECRET_KEY      = sk_test_...   (luego sk_live_... en producción)
STRIPE_WEBHOOK_SECRET  = whsec_...
STRIPE_PRICE_PRO       = price_...     (el del producto Pro)
STRIPE_PRICE_ENTERPRISE= price_...     (el del producto Enterprise)
```
Luego **Redeploy** para que tomen efecto.

## 6. Probar (modo Test)
1. Entra como **admin** de un negocio → **Mi licencia** → debe aparecer "Plan y pago".
2. Elige un plan → te lleva a Checkout de Stripe.
3. Paga con la tarjeta de prueba `4242 4242 4242 4242`, fecha futura, CVC cualquiera.
4. Verifica que la licencia quede **Activa** y el pago aparezca en el historial.

## 7. Pasar a producción
Repite 2–5 con la cuenta en **modo Live**: crea los precios live, usa `sk_live_...`,
crea el webhook live (misma URL) con su `whsec_...` y actualiza las variables en Vercel.

## Cómo funciona (resumen técnico)
- `src/lib/stripe.ts`: cliente Stripe + mapeo plan↔Price ID (todo opcional/env-gated).
- `POST /api/billing/checkout`: crea la sesión de suscripción (solo admin del negocio).
- `POST /api/billing/webhook`: ante `invoice.paid` extiende la licencia 1 mes y registra
  el cargo; ante fallo/cancelación, suspende. La doble extensión del alta se evita
  (el checkout solo activa; `invoice.paid` cobra/extiende).
- El precio guardado en `charges` sale de `src/lib/plans.ts` (COP), no de Stripe.
