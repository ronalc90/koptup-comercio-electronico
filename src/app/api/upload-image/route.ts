import { NextRequest, NextResponse } from 'next/server';
import { getRequestScopedClient } from '@/lib/tenantServer';

export async function POST(request: NextRequest) {
  try {
    const { image, folder } = await request.json();

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Cliente acotado al tenant + carpeta namespaced por tenant: los assets de
    // un negocio no colisionan ni se mezclan con los de otro.
    const { ctx, client: supabase } = await getRequestScopedClient();

    // Convert base64 to buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Detect mime type
    const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).slice(2, 8);
    const filePath = `t${ctx.tenantId}/${folder || 'products'}/${timestamp}-${randomId}.${ext}`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) throw error;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error uploading image';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
