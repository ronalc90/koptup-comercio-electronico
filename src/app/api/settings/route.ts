import { NextRequest, NextResponse } from 'next/server';
import { getRequestScopedClient } from '@/lib/tenantServer';

const MASKED_KEYS = ['openai_api_key'];

function maskValue(key: string, value: string): string {
  if (MASKED_KEYS.includes(key) && value.length > 4) {
    return `sk-...${value.slice(-4)}`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  try {
    const { client: supabase } = await getRequestScopedClient();

    if (key) {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .eq('key', key)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Check env var fallback for openai_api_key
        if (key === 'openai_api_key') {
          const envKey = process.env.OPENAI_API_KEY;
          if (envKey?.trim()) {
            return NextResponse.json({
              key,
              value: `env-...${envKey.slice(-4)}`,
              exists: true,
              source: 'environment',
            });
          }
        }
        return NextResponse.json({ key, value: null, exists: false });
      }

      return NextResponse.json({
        key: data.key,
        value: maskValue(data.key, data.value),
        exists: true,
      });
    }

    const { data, error } = await supabase
      .from('settings')
      .select('key, value');

    if (error) throw error;

    const masked = (data ?? []).map((row: { key: string; value: string }) => ({
      key: row.key,
      value: maskValue(row.key, row.value),
    }));

    return NextResponse.json({ settings: masked });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Settings GET error:', message);
    return NextResponse.json({ error: `Error al leer configuración: ${message}` }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body as { key: string; value: string };

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'El campo "key" es requerido' }, { status: 400 });
    }
    if (typeof value !== 'string') {
      return NextResponse.json({ error: 'El campo "value" es requerido' }, { status: 400 });
    }

    const { client: supabase } = await getRequestScopedClient();

    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' });

    if (error) throw error;

    return NextResponse.json({ success: true, key });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Settings PUT error:', message);
    return NextResponse.json({ error: `Error al guardar configuración: ${message}` }, { status: 500 });
  }
}
