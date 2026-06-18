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
    const scoped = await getRequestScopedClient();
    if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    const { ctx, client: supabase } = scoped;

    // Solo imágenes y de tipo permitido.
    const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : '';
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED.includes(mimeType)) {
      return NextResponse.json({ error: 'Tipo de imagen no permitido (jpeg/png/webp)' }, { status: 415 });
    }
    const ext = mimeType.split('/')[1] || 'jpg';

    // Convert base64 to buffer + límite de tamaño (5 MB).
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Imagen muy grande (máx 5 MB)' }, { status: 413 });
    }

    // No confiar solo en el MIME declarado del data-URI: verificar los magic
    // bytes reales del archivo para que no se almacene algo que no es imagen.
    const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isWebp = buffer.length > 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!isJpeg && !isPng && !isWebp) {
      return NextResponse.json({ error: 'El archivo no es una imagen válida (jpeg/png/webp)' }, { status: 415 });
    }

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
    console.error('Upload image error:', msg);
    return NextResponse.json({ error: 'No se pudo subir la imagen' }, { status: 500 });
  }
}
