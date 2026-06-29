import { notFound } from 'next/navigation';
import { getServiceClient } from '@/lib/supabase';
import { resolveTenantConfig, type TenantConfigOverrides } from '@/lib/tenants.config';
import { isProductPriceSupported } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface CatalogProduct {
  code: string;
  name: string;
  category: string | null;
  image_url: string | null;
  price: number | null;
}

/**
 * Catálogo PÚBLICO por tenant (Fase D). Servido desde koptup en /catalog/[slug].
 * Lee el catálogo REAL del tenant (productos activos), respeta su marca y muestra
 * nombre, foto y precio de venta. Sin sesión: usa el service client y filtra por
 * el tenant del slug. El QR del recibo y el de ajustes apuntan aquí.
 */
export default async function CatalogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getServiceClient();

  const { data: tenant } = await db
    .from('tenants')
    .select('id, name, slug, logo, active, config')
    .eq('slug', slug)
    .maybeSingle();
  if (!tenant || tenant.active === false) notFound();

  const cfg = resolveTenantConfig(
    tenant.slug as string,
    (tenant.config as TenantConfigOverrides | null) ?? undefined,
    tenant.name as string,
    tenant.logo as string,
  );

  const hasPrice = await isProductPriceSupported();
  const cols = hasPrice ? 'code, name, category, image_url, price' : 'code, name, category, image_url';
  const { data: rows } = await db
    .from('products')
    .select(cols)
    .eq('tenant_id', tenant.id)
    .eq('active', true)
    .order('name', { ascending: true });

  const products: CatalogProduct[] = ((rows ?? []) as unknown[]).map((r) => {
    const p = r as Record<string, unknown>;
    return {
      code: String(p.code ?? ''),
      name: String(p.name ?? ''),
      category: (p.category as string) ?? null,
      image_url: (p.image_url as string) ?? null,
      price: hasPrice && p.price != null ? Number(p.price) : null,
    };
  });

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Encabezado de marca */}
      <header className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-5xl px-4 py-6 flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">{cfg.logo}</span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{cfg.name}</h1>
            {cfg.tagline && <p className="text-sm text-gray-500 truncate">{cfg.tagline}</p>}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-6">
        {products.length === 0 ? (
          <p className="py-16 text-center text-gray-400">Este catálogo aún no tiene productos.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <article key={p.code} className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm flex flex-col">
                <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={`Foto de ${p.name}`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-4xl text-gray-300" aria-hidden="true">🛍️</span>
                  )}
                </div>
                <div className="p-3 flex flex-col gap-1 flex-1">
                  <h2 className="text-sm font-semibold text-gray-900 line-clamp-2">{p.name}</h2>
                  {p.category && <p className="text-[11px] text-gray-400">{p.category}</p>}
                  <p className="mt-auto pt-1 text-sm font-bold text-purple-700">
                    {p.price != null ? formatCurrency(p.price) : 'Consultar precio'}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-xs text-gray-400">
        {cfg.phone && <p>Pedidos: {cfg.phone}</p>}
        <p className="mt-1">Catálogo en línea · koptup</p>
      </footer>
    </main>
  );
}
