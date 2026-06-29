'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ImagePlus, Loader2 } from 'lucide-react';

/** ¿El logo es una imagen subida (URL) en vez de un emoji? */
export function isLogoUrl(logo: string | null | undefined): boolean {
  return typeof logo === 'string' && /^https?:\/\//.test(logo);
}

const EMOJIS = [
  '🏪', '🛒', '🛍️', '🏬', '👟', '👜', '🎒', '🧴', '🏍️', '🚗',
  '🔧', '🔌', '💻', '📱', '🎧', '🍔', '🍕', '☕', '🧁', '💄',
  '💊', '🧰', '🎸', '📚', '🌸', '🐾', '🎁', '🧢', '👕', '⌚',
];

interface LogoPickerProps {
  value: string;
  onChange: (v: string) => void;
  /** Permitir subir imagen (requiere sesión; en páginas públicas debe ser false). */
  allowUpload?: boolean;
}

export default function LogoPicker({ value, onChange, allowUpload = true }: LogoPickerProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const url = isLogoUrl(value);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Imagen muy grande (máx 5 MB)'); return; }
    setUploading(true);
    try {
      const dataUri = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const resp = await fetch('/api/upload-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUri, folder: 'logos' }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'No se pudo subir');
      onChange(data.url);
      toast.success('Logo subido');
    } catch (err) {
      console.error('logo upload:', err);
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la imagen');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 text-2xl">
          {url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value} alt="logo" className="h-full w-full object-cover" />
            : (value || '🏪')}
        </div>
        <span className="text-xs text-gray-500">Vista previa del logo</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EMOJIS.map((e) => (
          <button
            type="button"
            key={e}
            onClick={() => onChange(e)}
            aria-label={`Usar ${e} como logo`}
            className={`h-9 w-9 rounded-lg text-lg transition-colors ${
              value === e ? 'bg-purple-100 ring-2 ring-purple-400' : 'bg-gray-50 hover:bg-gray-100'
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      {allowUpload && (
        <>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            {uploading ? 'Subiendo…' : 'Subir imagen desde el PC'}
          </button>
        </>
      )}
    </div>
  );
}
