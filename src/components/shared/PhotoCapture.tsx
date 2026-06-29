'use client';

import { useState, useRef, useCallback } from 'react';
import { Camera, Upload, X, Loader2, RotateCcw, Maximize2 } from 'lucide-react';
import toast from 'react-hot-toast';
import ImageLightbox from './ImageLightbox';

// Lado máximo de la imagen subida desde galería (px). Mantiene el peso bajo el
// límite del servidor sin perder legibilidad de la foto del producto.
const MAX_IMAGE_DIM = 1280;

/** Lee un archivo de imagen y devuelve un JPEG base64 redimensionado (≤ MAX_IMAGE_DIM). */
function downscaleToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagen inválida'));
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('No se pudo procesar la imagen')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

interface PhotoCaptureProps {
  onPhotoReady: (imageUrl: string) => void;
  currentUrl?: string;
  compact?: boolean;
}

export default function PhotoCapture({ onPhotoReady, currentUrl, compact }: PhotoCaptureProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [uploading, setUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadImage = useCallback(async (base64: string) => {
    setUploading(true);
    try {
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, folder: 'products' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Error al subir la imagen');
      onPhotoReady(data.url);
      toast.success('Foto guardada');
      return data.url;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al subir foto');
      return null;
    } finally {
      setUploading(false);
    }
  }, [onPhotoReady]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setShowCamera(true);
    } catch {
      toast.error('No se pudo acceder a la cámara');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setShowCamera(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    setPreview(base64);
    stopCamera();
    const url = await uploadImage(base64);
    if (url) setPreview(url);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes');
      input.value = '';
      return;
    }
    try {
      // Redimensionamos la imagen de galería antes de subir (igual que la cámara):
      // evita el 413 del servidor (límite 5MB) tras esperar toda la subida.
      const base64 = await downscaleToBase64(file);
      setPreview(base64);
      const url = await uploadImage(base64);
      if (url) setPreview(url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo procesar la imagen');
    } finally {
      input.value = ''; // permite volver a elegir el mismo archivo
    }
  };

  const removePhoto = () => {
    setPreview(null);
    onPhotoReady('');
  };

  if (compact && !preview && !showCamera) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={startCamera}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-600 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition"
        >
          <Camera className="w-3.5 h-3.5" />
          Foto
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-600 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition"
        >
          <Upload className="w-3.5 h-3.5" />
          Subir
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Camera view */}
      {showCamera && (
        <div className="relative rounded-xl overflow-hidden bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-48 object-cover" />
          <div className="absolute bottom-2 inset-x-0 flex justify-center gap-3">
            <button
              type="button"
              onClick={capturePhoto}
              aria-label="Tomar foto"
              className="w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center active:scale-90 transition"
            >
              <div className="w-10 h-10 rounded-full border-2 border-purple-600" />
            </button>
            <button
              type="button"
              onClick={stopCamera}
              aria-label="Cerrar cámara"
              className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && !showCamera && (
        <div className="relative rounded-xl overflow-hidden bg-gray-100">
          <button
            type="button"
            onClick={() => !uploading && setShowLightbox(true)}
            className="block w-full cursor-zoom-in"
            aria-label="Ver foto ampliada"
            disabled={uploading}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Producto" className="w-full max-h-48 object-cover" />
          </button>
          {uploading && (
            <div className="pointer-events-none absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            </div>
          )}
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              type="button"
              onClick={() => setShowLightbox(true)}
              className="w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-purple-500 transition"
              aria-label="Ampliar"
              title="Ampliar"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={startCamera}
              className="w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-purple-500 transition"
              aria-label="Cambiar foto"
              title="Cambiar foto"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-purple-500 transition"
              aria-label="Subir otra"
              title="Subir otra"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={removePhoto}
              className="w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-500 transition"
              aria-label="Eliminar foto"
              title="Eliminar foto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Actions when no preview */}
      {!preview && !showCamera && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={startCamera}
            className="flex-1 flex items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 transition"
          >
            <Camera className="w-5 h-5" />
            Tomar foto
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 transition"
          >
            <Upload className="w-5 h-5" />
            Subir imagen
          </button>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <canvas ref={canvasRef} className="hidden" />

      {showLightbox && preview && (
        <ImageLightbox src={preview} onClose={() => setShowLightbox(false)} />
      )}
    </div>
  );
}
