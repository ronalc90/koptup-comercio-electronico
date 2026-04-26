# 🩴 Tu Tienda Meraki

**Sistema integral de gestión** para pedidos, inventario y despachos de Tu Tienda Meraki — pantuflas y maxisacos con amor desde Colombia.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000?logo=vercel)](https://vercel.com/)

---

## Funcionalidades

### Pedidos con Asistente Inteligente
- **Entrada por voz**: Dicta el pedido con el micrófono y se parsea automáticamente
- **Entrada por texto**: Pega el texto del pedido (WhatsApp, notas) y se extraen todos los campos
- **Formulario manual**: Campos completos para registro detallado
- **Vista diaria**: Tabla con todos los pedidos del día + KPIs en tiempo real
- **Calendario mensual**: Panorama del mes con recaudo y cantidad por día

### Dashboard Global
- KPIs principales: pedidos totales, recaudo, costos, utilidad
- Desglose por tipo de pago (Efectivo Bogo, Caja, Transferencia)
- Pedidos por vendedora (Ginna, Diana, Chiquis)
- Gráfica de recaudo diario con Recharts

### Inventario
- Control por canasta/ubicación física (C001, C002...)
- Filtros por modelo, color, talla, categoría
- Vistas separadas: Verificado vs Defectuoso
- CRUD completo con búsqueda instantánea

### Despacho e Impresión
- Selector de fecha para cargar pedidos confirmados
- Selección múltiple de pedidos para despachar
- **Generación de guías imprimibles** con formato "Tu Tienda Meraki"
- **Sugerencia de ruta** agrupando pedidos por barrio/zona

### Catálogo de Productos
- Gestión de productos con código, nombre, costo y categoría
- Búsqueda de costos automática al crear pedidos
- Categorías: Pantuflas, Maxisaco, Pocillo, Bolso

### Autenticación
- Login seguro con JWT y cookie httpOnly (30 días)
- Sesión persistente por dispositivo
- Diseño mobile-first optimizado para celular

---

## Tech Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 |
| Estilos | Tailwind CSS 4 |
| Base de datos | Supabase (PostgreSQL) |
| Parseo inteligente | OpenAI GPT-4o-mini |
| Voz | Web Speech API (nativa del navegador) |
| Gráficas | Recharts |
| Auth | JWT (jose) + bcrypt |
| Deploy | Vercel |

---

## Instalación

### Prerrequisitos
- Node.js 20+
- Cuenta en [Supabase](https://supabase.com) (gratis)
- API Key de [OpenAI](https://platform.openai.com) (para parseo inteligente)

### 1. Clonar e instalar

```bash
git clone https://github.com/ronalc90/Meraki.git
cd Meraki
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` con tus credenciales:
- **NEXT_PUBLIC_SUPABASE_URL**: URL de tu proyecto Supabase
- **NEXT_PUBLIC_SUPABASE_ANON_KEY**: Anon key de Supabase
- **OPENAI_API_KEY**: Tu API key de OpenAI

### 3. Crear tablas en Supabase

Ve al **SQL Editor** de Supabase y ejecuta el archivo `supabase-schema.sql`.

### 4. Importar datos existentes (opcional)

Si tienes los archivos Excel originales:

```bash
pip install openpyxl
python scripts/import-data.py
```

Luego ejecuta el SQL generado en `scripts/import-output/import-data.sql` en Supabase.

### 5. Iniciar desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) — usuario: `Paola`, contraseña: `1234`

---

## Pruebas automatizadas

### Unit tests (Vitest)

Validan funciones puras de `src/lib/` (formato de moneda, parseo de montos,
códigos de pedido, intenciones del librito, etc.).

```bash
npm test              # corre la suite completa
npm run test:watch    # modo watch durante desarrollo
```

Los archivos viven junto al código que cubren, con sufijo `.test.ts`
(ej: `src/lib/utils.test.ts`).

### E2E tests (Playwright)

Validan flujos completos en un navegador Chromium real: login, navegación
entre pantallas, modales de ayuda, toggle Calendario/Lista en Pedidos,
librito del asistente.

```bash
npm run test:e2e:install   # sólo la primera vez: instala Chromium
npm run test:e2e           # corre la suite contra http://localhost:3000
```

Los tests **autenticados** requieren credenciales reales; si no están
definidas el suite autenticada se saltea automáticamente:

```bash
MERAKI_E2E_USER=Paola MERAKI_E2E_PASSWORD='tu-password' npm run test:e2e
```

Podés apuntar a un preview de Vercel en vez del dev local con
`MERAKI_E2E_BASE_URL=https://meraki-xxxxx.vercel.app npm run test:e2e`.

---

## Estructura del Proyecto

```
src/
├── app/
│   ├── login/              # Página de login
│   ├── (protected)/        # Rutas protegidas
│   │   ├── dashboard/      # Dashboard global
│   │   ├── orders/         # Pedidos (mensual, diario, nuevo)
│   │   ├── inventory/      # Inventario
│   │   ├── products/       # Catálogo de costos
│   │   ├── dispatch/       # Despacho e impresión
│   │   └── settings/       # Configuración
│   └── api/
│       ├── ai/             # Endpoint de parseo inteligente
│       └── auth/           # Login / Logout
├── components/
│   ├── layout/             # Sidebar, MobileNav, AppShell
│   └── orders/             # AIOrderInput, formularios
└── lib/
    ├── auth.ts             # JWT + bcrypt
    ├── supabase.ts         # Cliente Supabase
    ├── types.ts            # Tipos TypeScript
    └── utils.ts            # Utilidades (formato moneda, fechas)
```

---

## Deploy en Vercel

1. Conecta el repo en [vercel.com](https://vercel.com)
2. Agrega las variables de entorno en Settings > Environment Variables
3. Deploy automático en cada push

---

## Base de Datos

### Tablas principales

| Tabla | Descripción | Registros importados |
|---|---|---|
| `products` | Catálogo de productos y costos | 198 |
| `orders` | Pedidos con toda la info de despacho | 25+ |
| `inventory` | Inventario físico por canasta | 1,650 |
| `settings` | Configuración de la app | - |

---

## Licencia

Proyecto privado de Tu Tienda Meraki. Todos los derechos reservados.

---

Desarrollado por **Ronald** 🇨🇴
