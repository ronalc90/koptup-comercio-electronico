'use client';

import { useState, useRef } from 'react';
import { Camera, Upload, Loader2, Sparkles, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/utils';

interface AnalyzedProduct {
  name: string;
  category: string;
  code: string;
  colors: string[];
  size: string | null;
  description: string;
  suggested_cost: number;
  /** URL pública de la foto ya subida al storage del negocio (si se subió). */
  image_url?: string;
}

interface ProductPhotoAIProps {
  onProductAnalyzed: (product: AnalyzedProduct) => void;
  onClose: () => void;
}

export default function ProductPhotoAI({ onProductAnalyzed, onClose }: ProductPhotoAIProps) {
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzedProduct | null>(null);
  const [context, setContext] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
      setResult(null);
    };
    reader.readAsDataURL(file);
  };

  const openCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(mediaStream);
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      }, 100);
    } catch {
      toast.error('No se pudo acceder a la cámara');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setImage(dataUrl);
    setResult(null);
    closeCamera();
  };

  const closeCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setShowCamera(false);
  };

  // Sube la foto analizada al storage del negocio y devuelve los datos + la URL.
  // Así la foto queda guardada con el producto (antes se descartaba tras analizar).
  const useResult = async () => {
    if (!result) return;
    setSaving(true);
    try {
      let image_url: string | undefined;
      if (image) {
        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image }),
        });
        const data = await res.json();
        if (res.ok && data.url) image_url = data.url;
        else toast.error('No se pudo guardar la foto; se usarán solo los datos');
      }
      onProductAnalyzed({ ...result, image_url });
    } finally {
      setSaving(false);
    }
  };

  const analyze = async () => {
    if (!image) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Normalizamos el shape: si la IA omite `colors` o `suggested_cost`, el
      // render (`result.colors.join`, `formatCurrency`) no debe reventar.
      setResult({
        name: typeof data.name === 'string' ? data.name : '',
        category: typeof data.category === 'string' ? data.category : '',
        code: typeof data.code === 'string' ? data.code : '',
        colors: Array.isArray(data.colors) ? data.colors.filter((c: unknown) => typeof c === 'string') : [],
        size: typeof data.size === 'string' ? data.size : null,
        description: typeof data.description === 'string' ? data.description : '',
        suggested_cost: Number(data.suggested_cost) || 0,
      });
      toast.success('Producto analizado');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al analizar');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h2 className="font-bold text-lg">Agregar con IA</h2>
          </div>
          <button onClick={() => { closeCamera(); onClose(); }} aria-label="Cerrar" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Camera view */}
          {showCamera && (
            <div className="relative rounded-xl overflow-hidden bg-black">
              <video ref={videoRef} autoPlay playsInline className="w-full" />
              <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                <button onClick={capturePhoto} aria-label="Tomar foto" className="w-16 h-16 bg-white rounded-full border-4 border-purple-600 hover:scale-105 transition" />
              </div>
            </div>
          )}

          {/* Image preview or upload buttons */}
          {!showCamera && !image && (
            <div className="flex flex-col items-center gap-4 py-8 border-2 border-dashed border-gray-200 rounded-xl">
              <div className="text-center text-gray-400 mb-2">
                <Camera className="w-12 h-12 mx-auto mb-2 text-purple-300" />
                <p className="font-medium text-gray-500">Toma una foto del producto</p>
                <p className="text-sm">o sube una imagen existente</p>
              </div>
              <div className="flex gap-3">
                <button onClick={openCamera} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium">
                  <Camera className="w-4 h-4" /> Cámara
                </button>
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium">
                  <Upload className="w-4 h-4" /> Subir foto
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
            </div>
          )}

          {/* Image preview */}
          {!showCamera && image && (
            <div className="relative">
              <img src={image} alt="Producto" className="w-full rounded-xl" />
              <button onClick={() => { setImage(null); setResult(null); }} aria-label="Quitar foto" className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full hover:bg-black/70">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Context input */}
          {image && !result && (
            <>
              <input
                type="text"
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Info adicional: cantidad, caja, notas... (opcional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <button
                onClick={analyze}
                disabled={analyzing}
                className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {analyzing ? <><Loader2 className="w-5 h-5 animate-spin" /> Analizando...</> : <><Sparkles className="w-5 h-5" /> Analizar con IA</>}
              </button>
            </>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="font-bold text-green-800 text-lg">{result.name}</p>
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-green-700">
                  <p><span className="font-medium">Categoría:</span> {result.category}</p>
                  <p><span className="font-medium">Código:</span> {result.code}</p>
                  <p><span className="font-medium">Colores:</span> {result.colors.join(', ')}</p>
                  {result.size && <p><span className="font-medium">Talla:</span> {result.size}</p>}
                  <p className="col-span-2"><span className="font-medium">Costo sugerido:</span> {formatCurrency(result.suggested_cost)}</p>
                </div>
                <p className="text-xs text-green-600 mt-2">{result.description}</p>
              </div>

              <div className="flex gap-2">
                <button onClick={useResult} disabled={saving} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition flex items-center justify-center gap-1.5 disabled:opacity-60">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Check className="w-4 h-4" /> Usar datos</>}
                </button>
                <button onClick={() => { setImage(null); setResult(null); }} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition">
                  Tomar otra foto
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
