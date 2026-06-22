'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Send, Sparkles, Check, X, Loader2, Package, ShoppingBag, Search, MapPin, Download, Trash2, ChevronRight, HelpCircle, CheckCircle, RotateCcw, AlertTriangle, DollarSign, Receipt, FileText, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/UserContext';
import { useTenant } from '@/lib/TenantContext';
import { isOwnerSupported, isPaymentTimingSupported, courierPendingColumn, isOrderQuantitySupported } from '@/lib/db';
import { formatCurrency, generateOrderCode, parseCopAmount, vendorDisplayName } from '@/lib/utils';
import { syncInventoryOnOrderSave } from '@/lib/inventorySync';
import type { PaymentTiming } from '@/lib/types';
import DispatchGuide from '@/components/dispatch/DispatchGuide';
import AssistantHelpModal from '@/components/assistant/AssistantHelpModal';
import WorkdayArchiveModal from '@/components/assistant/WorkdayArchiveModal';
import ImageLightbox from '@/components/shared/ImageLightbox';
import { downloadExcel } from '@/lib/export';
import {
  saveWorkday,
  listWorkdays,
  findWorkdayByQuery,
  detectArchiveIntent,
  type Workday,
} from '@/lib/workdayArchive';
import { detectConfirmIntent } from '@/lib/assistant/confirmIntent';
import { MODIFYING_ACTIONS, EDITABLE_ORDER_FIELDS, EDITABLE_EXPENSE_FIELDS, isDestructiveAction, DESTRUCTIVE_CONFIRM_PHRASE } from '@/lib/assistant/constants';
import {
  normalizeOrderStatus,
  normalizeExpenseCategory,
  resolveTenantCategory,
  normalizeQuantity,
  normalizeStockQuantity,
  isValidDateString,
} from '@/lib/assistant/validation';
import { resolveSingleMatch } from '@/lib/assistant/matching';
import { buildAssistantExamples, type ExampleGroup } from '@/lib/assistant/examples';

interface SubAction {
  action: string;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  action?: string;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
  actions?: SubAction[];
  results?: Array<Record<string, unknown>>;
  needsConfirmation?: boolean;
  confirmed?: boolean;
}

interface PhotoState { preview?: string; uploading?: boolean; imageUrl?: string }

function compressImage(file: File, maxWidth = 600): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Target ~500KB max - reduce quality until small enough
      let quality = 0.6;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > 700000 && quality > 0.2) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

function PhotoBeforeConfirm({ state, onStateChange, onSkip }: {
  state: PhotoState;
  onStateChange: (s: PhotoState) => void;
  onSkip: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const compressed = await compressImage(file);
    onStateChange({ preview: compressed, uploading: true });
    try {
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: compressed, folder: 'products' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      onStateChange({ preview: compressed, uploading: false, imageUrl: d.url });
      toast.success('Foto lista');
    } catch {
      toast.error('Error al subir foto');
      onStateChange({});
    }
  };

  return (
    <div className="mx-2 md:mx-4 mb-1 p-3 bg-purple-50 border border-purple-200 rounded-xl animate-fadeIn shrink-0">
      <p className="text-xs font-semibold text-purple-800 mb-2">¿Agregar foto del producto?</p>
      {state.preview ? (
        <div className="relative rounded-xl overflow-hidden mb-2">
          <img src={state.preview} alt="Preview" className="w-full h-32 object-cover" />
          {state.uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            </div>
          )}
          {state.imageUrl && (
            <div className="absolute bottom-2 right-2 bg-green-500 text-white rounded-full p-1.5">
              <Check className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-purple-200 text-xs font-medium text-purple-600 hover:bg-purple-100 transition active:scale-95">
            📸 Tomar foto
          </button>
          <button type="button" onClick={() => galleryRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-purple-200 text-xs font-medium text-purple-600 hover:bg-purple-100 transition active:scale-95">
            🖼️ Galería
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      <button onClick={onSkip} className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition">
        {state.imageUrl ? 'Continuar →' : 'Sin foto, continuar →'}
      </button>
    </div>
  );
}

export default function AssistantPage() {
  const owner = useUser();
  const { config } = useTenant();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingAction, setPendingAction] = useState<ChatMessage | null>(null);
  const [showGuide, setShowGuide] = useState<Record<string, unknown> | null>(null);
  const [preConfirmPhoto, setPreConfirmPhoto] = useState<PhotoState | null>(null);
  const [photoStepDone, setPhotoStepDone] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('meraki-chat');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch { /* ignore */ }
    setChatLoaded(true);
  }, []);

  // Persist chat history when it changes (only after initial load)
  useEffect(() => {
    if (!chatLoaded) return;
    try { localStorage.setItem('meraki-chat', JSON.stringify(messages.slice(-100))); } catch { /* ignore */ }
  }, [messages, chatLoaded]);

  // Lock background scroll on mobile while the full-screen detail overlay is open.
  useEffect(() => {
    if (!selectedItem) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [selectedItem]);

  const clearChat = () => {
    setMessages([]);
    setPendingAction(null);
    localStorage.removeItem('meraki-chat');
    toast.success('Chat limpiado');
  };

  const startNewWorkday = () => {
    if (messages.length === 0) {
      toast('No hay chat para guardar', { icon: 'ℹ️' });
      return;
    }
    const saved = saveWorkday(messages);
    setMessages([]);
    setPendingAction(null);
    setPreConfirmPhoto(null);
    setPhotoStepDone(false);
    localStorage.removeItem('meraki-chat');
    toast.success(saved ? `Guardado en el librito — ${saved.label}` : 'Chat limpiado');
  };

  const restoreWorkday = (workday: Workday) => {
    setMessages(workday.messages);
    setPendingAction(null);
    setPreConfirmPhoto(null);
    setPhotoStepDone(false);
    setArchiveOpen(false);
    toast.success(`Chat restaurado — ${workday.label}`);
    scrollToBottom();
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    // Voice/text shortcut: open the librito or restore a specific archived day
    // without calling the AI (works offline and is deterministic).
    const archiveIntent = detectArchiveIntent(text);
    if (archiveIntent) {
      const userMsg: ChatMessage = { role: 'user', content: text };
      setInput('');
      if (archiveIntent.kind === 'list') {
        setMessages(prev => [...prev, userMsg, {
          role: 'assistant',
          content: listWorkdays().length === 0
            ? 'Tu librito está vacío por ahora. Cada vez que pulses "Nuevo día" guardo el chat acá.'
            : 'Acá está tu librito con los días guardados.',
        }]);
        setArchiveOpen(true);
        scrollToBottom();
        return;
      }
      const match = findWorkdayByQuery(archiveIntent.query ?? text);
      if (match) {
        setMessages(prev => [...prev, userMsg]);
        restoreWorkday(match);
        return;
      }
      setMessages(prev => [...prev, userMsg, {
        role: 'assistant',
        content: 'No encontré un día guardado que coincida. Abrí el librito para ver la lista.',
      }]);
      setArchiveOpen(true);
      scrollToBottom();
      return;
    }

    // Confirmación por VOZ/TEXTO: si hay una acción pendiente y la usuaria dice
    // "sí/dale/confírmalo" (o "no/cancela"), lo resolvemos localmente SIN pasar
    // por el LLM. Antes ese "sí" iba al modelo, devolvía {action:'confirm'} y
    // nadie ejecutaba la acción pendiente: quedaba colgada. El núcleo del chat
    // es "habla en tus palabras", así que confirmar hablando DEBE funcionar.
    if (pendingAction) {
      const intent = detectConfirmIntent(text);
      // Acciones DESTRUCTIVAS (borrar): NO basta "sí/dale" — la usuaria debe
      // escribir literalmente "Acepto". Solo "cancela/no" aborta.
      if (isDestructiveAction(pendingAction.action)) {
        if (text.trim().toLowerCase() === DESTRUCTIVE_CONFIRM_PHRASE.toLowerCase()) {
          setMessages(prev => [...prev, { role: 'user', content: text }]);
          setInput('');
          await confirmAction();
          return;
        }
        if (intent === 'reject') {
          setMessages(prev => [...prev, { role: 'user', content: text }]);
          setInput('');
          rejectAction();
          return;
        }
        // Cualquier otra cosa: recordamos el gate y NO ejecutamos ni descartamos.
        setMessages(prev => [...prev,
          { role: 'user', content: text },
          { role: 'assistant', content: `Para eliminar escribe exactamente "${DESTRUCTIVE_CONFIRM_PHRASE}" (o di "cancela").` },
        ]);
        setInput('');
        scrollToBottom();
        return;
      }
      if (intent === 'confirm') {
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setInput('');
        if (!photoStepDone) setPhotoStepDone(true); // salta el paso de foto opcional
        await confirmAction();
        return;
      }
      if (intent === 'reject') {
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setInput('');
        rejectAction();
        return;
      }
      // Mensaje nuevo (ni sí ni no) con una acción pendiente: la descartamos para
      // no dejar dos barras compitiendo; re-interpretamos lo que pidió ahora.
      setPendingAction(null);
      setPreConfirmPhoto(null);
      setPhotoStepDone(false);
    }

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    scrollToBottom();

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `owner` ya no se envía: el route lo ignora (aislamiento por tenant).
        body: JSON.stringify({ message: text, context: messages.slice(-10) }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'No se pudo procesar la solicitud');

      // Solo las acciones que MODIFICAN datos fuerzan confirmación. Si la
      // respuesta no trae acción (el modelo violó el contrato), NO entramos al
      // flujo de confirmación: mostramos un mensaje claro en vez de un confuso
      // "¿Confirmas esta acción?" sin acción.
      const needsConf = !!data.action &&
        (data.needs_confirmation || (MODIFYING_ACTIONS as readonly string[]).includes(data.action));

      const fallbackContent = data.action && data.action !== 'chat'
        ? '¿Confirmas esta acción?'
        : 'No entendí bien, ¿puedes reformularlo?';

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.message || fallbackContent,
        action: data.action,
        data: data.data,
        actions: data.action === 'multi_action' ? data.actions : undefined,
        results: data.results,
        needsConfirmation: needsConf,
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (needsConf) {
        // Check if action involves inventory → ask for photo first
        const hasInventory = data.action === 'add_inventory' ||
          (data.action === 'multi_action' && data.actions?.some((a: SubAction) => a.action === 'add_inventory'));
        if (hasInventory) {
          setPreConfirmPhoto({});
          setPhotoStepDone(false);
        } else {
          setPhotoStepDone(true);
        }
        setPendingAction(assistantMsg);
      }

      // Agent action: auto-trigger report download
      if (data.action === 'generate_report' && data.report) {
        const r = data.report;
        try {
          // El endpoint de export ya scope-a por tenant; no se manda `owner`.
          const params: Record<string, string> = {};
          if (r.type) params.type = r.type;
          if (r.date) params.date = r.date;
          if (r.month) params.month = String(r.month);
          if (r.year) params.year = String(r.year);
          // Default: if no date/month provided, use today
          if (r.type === 'orders-daily' && !r.date) {
            params.date = new Date().toISOString().slice(0, 10);
          }
          if (r.type === 'dashboard' && !r.month) {
            params.month = String(new Date().getMonth() + 1);
            params.year = String(new Date().getFullYear());
          }
          await downloadExcel(r.type || 'orders-daily', params);
          toast.success('Reporte descargado');
        } catch {
          toast.error('Error al generar el reporte');
        }
      }

      // Reimprimir guía: el route resolvió el pedido; mostramos la guía (read-only).
      if (data.action === 'reprint_order_guide' && data.data && data.data.order_code) {
        setShowGuide(data.data as Record<string, unknown>);
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      const msg = raw || 'Error de conexión';
      toast.error(msg);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}` }]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const execSingleAction = async (action: string, data: any, hasOwner: boolean): Promise<string> => {
    if (action === 'create_order') {
      const orderData = data as Record<string, unknown>;
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10);
      const orderQty = normalizeQuantity(orderData.quantity);

      const valueToCollect = Number(orderData.value_to_collect) || 0;
      const rawTiming = String(orderData.payment_timing || 'ContraEntrega');
      const paymentTiming: PaymentTiming = (['Anticipado', 'ContraEntrega', 'Mixto', 'Otro'].includes(rawTiming)
        ? rawTiming
        : 'ContraEntrega') as PaymentTiming;
      // Anticipado implica que ya pagó todo; Mixto usa el monto que el asistente extrajo.
      const prepaidHint = Number(orderData.prepaid_amount) || 0;
      const prepaidAmount =
        paymentTiming === 'Anticipado'
          ? valueToCollect
          : paymentTiming === 'Mixto'
            ? Math.max(0, Math.min(prepaidHint, valueToCollect))
            : 0;

      // Canal del abono anticipado: si el AI lo dice, registramos el pago recibido.
      const channel = String(orderData.payment_channel_prepaid || '').toLowerCase();
      let payment_cash = 0, payment_transfer = 0, payment_courier_pending = 0;
      if (prepaidAmount > 0) {
        if (channel === 'transfer' || channel === 'nequi' || channel === 'daviplata') payment_transfer = prepaidAmount;
        else if (channel === 'cash') payment_cash = prepaidAmount;
        // 'courier' / 'mensajero' / legacy 'bogo' → pendiente de liquidación
        else if (channel === 'courier' || channel === 'mensajero' || channel === 'bogo') payment_courier_pending = prepaidAmount;
      }

      const courierColumn = await courierPendingColumn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const basePayload: any = {
        client_name: orderData.client_name || '', phone: String(orderData.phone || ''),
        city: String(orderData.city || 'Bogotá'), address: String(orderData.address || ''), complement: String(orderData.complement || ''),
        product_ref: String(orderData.product_ref || ''), detail: String(orderData.detail || ''), comment: String(orderData.comment || ''),
        value_to_collect: valueToCollect, delivery_status: 'Confirmado', vendor: vendorDisplayName(owner), order_date: dateStr,
        [courierColumn]: payment_courier_pending,
        payment_cash, payment_transfer, product_cost: 0, operating_cost: 0, prepaid_amount: prepaidAmount, is_exchange: false,
        status_complement: '',
      };
      if (hasOwner) basePayload.owner = owner;
      const hasTiming = await isPaymentTimingSupported();
      if (hasTiming) basePayload.payment_timing = paymentTiming;
      if (await isOrderQuantitySupported()) basePayload.quantity = orderQty;

      // order_code = fecha + secuencial del día. El secuencial sale de un conteo
      // leído justo antes de insertar; si dos pedidos se crean a la vez podrían
      // colisionar. Reintentamos con el siguiente secuencial ante violación de
      // unicidad (índice uq_orders_tenant_code, migración 013). Sin el índice no
      // hay violación y el primer intento basta (comportamiento previo).
      let orderCode = '';
      let insertErr: { code?: string; message?: string } | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data: existing } = await supabase.from('orders').select('id').gte('order_date', dateStr).lte('order_date', dateStr);
        const seq = (existing?.length || 0) + 1 + attempt;
        orderCode = generateOrderCode(today, seq);
        basePayload.order_code = orderCode;
        const { error } = await supabase.from('orders').insert(basePayload);
        if (!error) { insertErr = null; break; }
        insertErr = error;
        if (error.code !== '23505') break; // no es colisión de unicidad → no reintentar
      }
      if (insertErr) throw new Error(insertErr.message || 'No se pudo guardar el pedido');

      // Sync inventario: descuenta (nunca negativo) o crea en cero con costo de referencia
      const detailStr = String(orderData.detail || '');
      const productRef = String(orderData.product_ref || '');
      let catalogProduct = null;
      if (productRef) {
        let pq = supabase.from('products').select('*').eq('code', productRef);
        if (hasOwner) pq = pq.eq('owner', owner);
        const { data: p } = await pq.limit(1);
        if (p?.length) catalogProduct = p[0];
      }
      const invResult = await syncInventoryOnOrderSave({
        owner, hasOwner,
        productRef,
        detail: detailStr,
        searchTerm: detailStr || productRef,
        quantity: orderQty,
        product: catalogProduct,
      });

      setShowGuide(basePayload);
      const tail = invResult.createdZeroStock
        ? ' Producto sin stock previo: creé un registro en inventario en 0 con el costo de referencia para contabilidad.'
        : invResult.decremented
          ? ' Stock actualizado.'
          : '';
      const timingMsg = paymentTiming === 'Anticipado'
        ? ' Marcado como YA PAGADO en la guía.'
        : paymentTiming === 'Mixto'
          ? ` Abono registrado: ${prepaidAmount}. Saldo contra entrega.`
          : '';
      return `Pedido #${orderCode} guardado para ${orderData.client_name}.${timingMsg}${tail}`;
    }
    if (action === 'add_inventory') {
      const items = (Array.isArray(data) ? data : [data]) as Array<Record<string, unknown>>;
      // Canasta/ubicación OBLIGATORIA (trazabilidad). El prompt ya la pide; aquí
      // validamos por si el modelo la omitió: no guardamos inventario "perdido".
      const sinUbicacion = items.filter(it => !String(it.basket_location || '').trim());
      if (sinUbicacion.length > 0) {
        const faltan = sinUbicacion.map(it => String(it.model || 'producto')).join(', ');
        return `Para guardar en inventario necesito la canasta/ubicación de: ${faltan}. ¿En qué canasta lo guardaste?`;
      }
      const imgUrl = preConfirmPhoto?.imageUrl || '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payloads = items.map(item => { const p: any = { model: item.model || '', category: resolveTenantCategory(item.category, config.categories), product_id: item.product_id || '', color: item.color || '', size: item.size || '', quantity: normalizeQuantity(item.quantity), basket_location: String(item.basket_location).trim(), type: item.type || '', observations: item.observations || '', status: 'Bueno', verified: false, reference: 0, image_url: imgUrl }; if (hasOwner) p.owner = owner; return p; });
      const { error } = await supabase.from('inventory').insert(payloads);
      if (error) throw error;
      setPreConfirmPhoto(null);
      return `${items.length} item(s) agregados al inventario.${imgUrl ? ' Con foto.' : ''}`;
    }
    if (action === 'mark_defective') {
      const defData = data as Record<string, unknown>;
      const model = String(defData.model || '').toLowerCase();
      const qty = normalizeQuantity(defData.quantity);
      let invQuery = supabase.from('inventory').select('*').eq('status', 'Bueno').gt('quantity', 0);
      if (hasOwner) invQuery = invQuery.eq('owner', owner);
      if (model) invQuery = invQuery.ilike('model', `%${model}%`);
      if (defData.color) invQuery = invQuery.ilike('color', `%${String(defData.color)}%`);
      // limit(5) + resolución estricta: si hay 0 o >1, NO tocamos nada (evita
      // marcar defectuoso el item equivocado cuando dos modelos comparten prefijo).
      const { data: invItems } = await invQuery.limit(5);
      const res = resolveSingleMatch(invItems);
      if (res.kind === 'none') return 'No encontré ese producto en inventario.';
      if (res.kind === 'ambiguous') {
        const list = res.candidates
          .map((i: Record<string, unknown>) => `• ${String(i.model || '')} ${String(i.color || '')} ${String(i.size || '')} (${String(i.basket_location || 's/canasta')})`)
          .join('\n');
        return `Hay varios productos que coinciden, no marqué ninguno para no equivocarme. ¿Cuál es?\n${list}\nDime el modelo + color/talla exactos.`;
      }
      const item = res.item;
      await supabase.from('inventory').update({ quantity: Math.max(0, item.quantity - qty) }).eq('id', item.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const defPayload: any = { model: item.model, category: item.category, product_id: item.product_id, color: item.color, size: item.size, quantity: qty, basket_location: item.basket_location, type: item.type, observations: String(defData.observations || 'Defectuoso'), status: 'Malo', verified: false, reference: 0 };
      if (hasOwner) defPayload.owner = owner;
      await supabase.from('inventory').insert(defPayload);
      return `${qty} unidad(es) de ${item.model} marcadas como defectuosas.`;
    }
    if (action === 'return_order') {
      const retData = data as Record<string, unknown>;
      let oq = supabase.from('orders').select('*');
      if (hasOwner) oq = oq.eq('owner', owner);
      if (retData.order_code) oq = oq.eq('order_code', String(retData.order_code));
      else if (retData.client_name) oq = oq.ilike('client_name', `%${String(retData.client_name)}%`);
      oq = oq.order('created_at', { ascending: false });
      const { data: found } = await oq.limit(5);
      const res = resolveSingleMatch(found);
      if (res.kind === 'none') return 'No encontré ese pedido.';
      if (res.kind === 'ambiguous') {
        const list = res.candidates
          .map((o: Record<string, unknown>) => `• #${String(o.order_code)} — ${String(o.client_name)} (${String(o.delivery_status)})`)
          .join('\n');
        return `Hay varios pedidos que coinciden, no registré la devolución. ¿Cuál es? Dame el código:\n${list}`;
      }
      const order = res.item;
      // Idempotencia: si ya estaba en Devolución, no volver a sumar stock.
      if (order.delivery_status === 'Devolucion') {
        return `El pedido #${order.order_code} de ${order.client_name} ya estaba marcado como devolución.`;
      }
      const mergedChanges: Record<string, unknown> = {
        delivery_status: 'Devolucion',
        comment: `${order.comment || ''} | Devolución: ${retData.reason || ''}`.trim(),
      };
      await supabase.from('orders').update(mergedChanges).eq('id', order.id);
      // Restaura la CANTIDAD real del pedido (no un +1 fijo). Si la columna
      // quantity no existe aún, normalizeQuantity cae a 1 (igual que antes).
      const restoreQty = normalizeQuantity(order.quantity);
      const detail = (order.detail || order.product_ref || '').toLowerCase();
      let restored = false;
      if (detail) {
        let iq = supabase.from('inventory').select('*').eq('status', 'Bueno');
        if (hasOwner) iq = iq.eq('owner', owner);
        const { data: inv } = await iq;
        if (inv?.length) {
          const m = inv.find(i => detail.includes(i.model.toLowerCase()) || i.model.toLowerCase().includes(detail.split(' ')[0]));
          if (m) { await supabase.from('inventory').update({ quantity: m.quantity + restoreQty }).eq('id', m.id); restored = true; }
        }
      }
      return `Pedido #${order.order_code} de ${order.client_name} → Devolución.${restored ? ` Stock restaurado (+${restoreQty}).` : ''}`;
    }
    if (action === 'update_order_status') {
      const sd = data as Record<string, unknown>;
      // Validamos el estado contra el enum ANTES de escribir: si el modelo
      // inventó un estado inválido, no lo persistimos (rompería chk_orders_status).
      const ns = normalizeOrderStatus(sd.new_status ?? 'Entregado');
      if (!ns) {
        return `No reconozco el estado "${String(sd.new_status)}". Los válidos son: Confirmado, Enviado, Entregado, Pagado, Devolucion, Cancelado.`;
      }
      let oq = supabase.from('orders').select('*');
      if (hasOwner) oq = oq.eq('owner', owner);
      if (sd.order_code) oq = oq.eq('order_code', String(sd.order_code));
      else if (sd.client_name) oq = oq.ilike('client_name', `%${String(sd.client_name)}%`);
      oq = oq.order('created_at', { ascending: false });
      const { data: found } = await oq.limit(5);
      const res = resolveSingleMatch(found);
      if (res.kind === 'none') return 'No encontré ese pedido.';
      if (res.kind === 'ambiguous') {
        const list = res.candidates
          .map((o: Record<string, unknown>) => `• #${String(o.order_code)} — ${String(o.client_name)} (${String(o.delivery_status)})`)
          .join('\n');
        return `Hay varios pedidos que coinciden, no cambié ninguno. ¿Cuál es? Dame el código:\n${list}`;
      }
      const order = res.item;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mergedChanges: any = { delivery_status: ns };
      // El AI puede mandar el campo nuevo (payment_courier_pending) o el legacy (payment_cash_bogo).
      const courierAmt = sd.payment_courier_pending ?? sd.payment_cash_bogo;
      if (courierAmt) {
        const col = await courierPendingColumn();
        mergedChanges[col] = Number(courierAmt);
      }
      if (sd.payment_cash) mergedChanges.payment_cash = Number(sd.payment_cash);
      if (sd.payment_transfer) mergedChanges.payment_transfer = Number(sd.payment_transfer);
      await supabase.from('orders').update(mergedChanges).eq('id', order.id);
      // El stock se descuenta UNA sola vez, al CREAR el pedido (syncInventory).
      // Antes esto volvía a descontar al pasar a "Entregado" → doble descuento.
      // Ya NO se toca el inventario aquí.
      return `Pedido #${order.order_code} de ${order.client_name} → "${ns}".`;
    }
    if (action === 'register_expense') {
      const ed = data as Record<string, unknown>;
      const amount = parseCopAmount(ed.amount as string | number) ?? 0;
      if (amount <= 0) {
        return `No entendí el monto del gasto ("${ed.amount ?? ''}"). Dame una cifra válida en COP.`;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = { description: String(ed.description || ''), amount, category: normalizeExpenseCategory(ed.category), expense_date: new Date().toISOString().slice(0, 10) };
      if (hasOwner) p.owner = owner; if (ed.order_id) p.order_id = Number(ed.order_id); if (ed.product_ref) p.product_ref = String(ed.product_ref);
      const { error } = await supabase.from('expenses').insert(p);
      // Lanza (no devuelve string) para que en multi_action cuente como ✗ y no
      // se enmascare un fallo como "✓ Error al registrar gasto...".
      if (error) throw new Error('No se pudo registrar el gasto: ' + error.message);
      return `Gasto de ${formatCurrency(amount)} registrado: "${ed.description}".`;
    }
    if (action === 'update_cost') {
      const cd = data as Record<string, unknown>;
      const modelRaw = String(cd.model || '').trim();
      const model = modelRaw.toLowerCase();
      const cost = parseCopAmount(cd.cost as string | number);
      if (!modelRaw) {
        return 'No logré identificar el producto. ¿Cuál modelo querés actualizar?';
      }
      if (cost === null) {
        return `No pude interpretar el costo recibido ("${cd.cost}"). Dame un número válido en COP.`;
      }
      if (cost < 0) {
        return 'El costo no puede ser negativo.';
      }
      let pq = supabase.from('products').select('*');
      if (hasOwner) pq = pq.eq('owner', owner);
      pq = pq.ilike('name', `%${model}%`);
      const { data: prods, error: prodErr } = await pq.limit(5);
      if (prodErr) {
        throw new Error(`No pude consultar el catálogo: ${prodErr.message}`);
      }
      if (!prods || prods.length === 0) {
        return `No encontré ningún producto que coincida con "${modelRaw}". No guardé nada. ¿Podés darme el nombre o código exacto?`;
      }
      if (prods.length > 1) {
        const list = prods.map((p) => `• ${p.name} (${p.code}) — actual ${formatCurrency(p.cost ?? 0)}`).join('\n');
        return `Encontré ${prods.length} productos que coinciden con "${modelRaw}", no guardé nada para evitar modificar el equivocado:\n${list}\n\nDame el nombre o código exacto.`;
      }
      const product = prods[0];
      const { error: updErr } = await supabase.from('products').update({ cost }).eq('id', product.id);
      if (updErr) {
        throw new Error(`No pude guardar el costo: ${updErr.message}`);
      }
      let invCount = 0;
      let iq = supabase.from('inventory').select('id');
      if (hasOwner) iq = iq.eq('owner', owner);
      if (product.code) iq = iq.eq('product_id', product.code);
      const { data: invByCode } = await iq;
      let invTargets = invByCode ?? [];
      if (invTargets.length === 0) {
        const nameToken = product.name.trim().toLowerCase().split(/\s+/)[0];
        if (nameToken) {
          let iq2 = supabase.from('inventory').select('id');
          if (hasOwner) iq2 = iq2.eq('owner', owner);
          iq2 = iq2.ilike('model', `%${nameToken}%`);
          const { data: invByModel } = await iq2;
          invTargets = invByModel ?? [];
        }
      }
      if (invTargets.length > 0) {
        const { error: invErr } = await supabase
          .from('inventory')
          .update({ reference: cost })
          .in('id', invTargets.map((i) => i.id));
        if (!invErr) invCount = invTargets.length;
      }
      const tail = invCount > 0 ? ` (${invCount} item(s) de inventario sincronizados)` : '';
      return `Registré el costo de "${product.name}" en ${formatCurrency(cost)}.${tail}`;
    }
    if (action === 'edit_order') {
      // El route ya resolvió el pedido (order_id) y validó los campos; aquí solo
      // aplicamos el UPDATE tras la confirmación de la usuaria (antes el route lo
      // escribía solo, sin confirmar). Re-aplicamos la whitelist por seguridad.
      const ed = data as Record<string, unknown>;
      const orderId = ed.order_id;
      const updates = (ed.updates || {}) as Record<string, unknown>;
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updates)) {
        if ((EDITABLE_ORDER_FIELDS as readonly string[]).includes(k)) {
          // value_to_collect puede venir como "85.000" → normalizar a número.
          safe[k] = k === 'value_to_collect' ? (parseCopAmount(v as string | number) ?? Number(v) ?? 0) : v;
        }
      }
      if (!orderId || Object.keys(safe).length === 0) {
        return 'No había cambios válidos para aplicar al pedido.';
      }
      const { error } = await supabase.from('orders').update(safe).eq('id', Number(orderId));
      if (error) throw new Error('No se pudo actualizar el pedido: ' + error.message);
      return `Pedido #${ed.order_code} de ${ed.client_name} actualizado (${Object.keys(safe).join(', ')}).`;
    }
    if (action === 'create_product') {
      const pd = data as Record<string, unknown>;
      const code = String(pd.code || '').trim().toUpperCase().slice(0, 10);
      const name = String(pd.name || '').trim();
      const cost = parseCopAmount(pd.cost as string | number);
      if (!code) return 'Necesito el código del producto (ej: CAS001) para crearlo. ¿Cuál es?';
      if (!name) return 'Necesito el nombre del producto. ¿Cuál es?';
      if (cost === null || cost < 0) return `No entendí el costo ("${pd.cost}"). Dame un número válido en COP.`;
      const category = resolveTenantCategory(pd.category, config.categories);
      const active = typeof pd.active === 'boolean' ? pd.active : true;
      let dq = supabase.from('products').select('id').eq('code', code);
      if (hasOwner) dq = dq.eq('owner', owner);
      const { data: dup } = await dq.limit(1);
      if (dup?.length) return `Ya existe un producto con el código "${code}". Usa otro código o edítalo.`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = { code, name, cost, category, active, image_url: null };
      if (hasOwner) payload.owner = owner;
      const { error } = await supabase.from('products').insert(payload);
      if (error) {
        const raw = error.message || '';
        if (raw.includes('PLAN_LIMIT')) return 'Alcanzaste el límite de productos de tu plan. Sube de plan para agregar más.';
        if ((error as { code?: string }).code === '23505') return `Ya existe un producto con el código "${code}".`;
        throw new Error('No se pudo crear el producto: ' + raw);
      }
      return `Producto creado: ${code} — ${name} (${category}) a ${formatCurrency(cost)}.`;
    }
    if (action === 'edit_product') {
      const pd = data as Record<string, unknown>;
      const updatesRaw = (pd.updates || {}) as Record<string, unknown>;
      let pq = supabase.from('products').select('*');
      if (hasOwner) pq = pq.eq('owner', owner);
      const code = String(pd.code || '').trim();
      const nameMatch = String(pd.name_match || '').trim().toLowerCase();
      if (code) pq = pq.eq('code', code.toUpperCase());
      else if (nameMatch) pq = pq.ilike('name', `%${nameMatch}%`);
      else return 'Dime el código o el nombre del producto a editar.';
      const { data: prods } = await pq.limit(5);
      const res = resolveSingleMatch(prods);
      if (res.kind === 'none') return 'No encontré ese producto. Dame el código o el nombre exacto.';
      if (res.kind === 'ambiguous') {
        const list = res.candidates.map((p: Record<string, unknown>) => `• ${String(p.name)} (${String(p.code)})`).join('\n');
        return `Hay varios productos que coinciden, no edité ninguno. ¿Cuál?\n${list}`;
      }
      const product = res.item;
      const safe: Record<string, unknown> = {};
      if (typeof updatesRaw.name === 'string' && updatesRaw.name.trim()) safe.name = updatesRaw.name.trim();
      if (updatesRaw.category !== undefined) safe.category = resolveTenantCategory(updatesRaw.category, config.categories);
      if (updatesRaw.cost !== undefined) {
        const c = parseCopAmount(updatesRaw.cost as string | number);
        if (c === null || c < 0) return `Costo inválido ("${updatesRaw.cost}").`;
        safe.cost = c;
      }
      if (typeof updatesRaw.active === 'boolean') safe.active = updatesRaw.active;
      if (Object.keys(safe).length === 0) return 'No identifiqué qué cambiar del producto (nombre, categoría, costo o activar/desactivar).';
      const { error } = await supabase.from('products').update(safe).eq('id', product.id);
      if (error) throw new Error('No se pudo actualizar el producto: ' + error.message);
      let tail = '';
      if (safe.cost !== undefined && product.code) {
        let iq = supabase.from('inventory').select('id');
        if (hasOwner) iq = iq.eq('owner', owner);
        iq = iq.eq('product_id', product.code);
        const { data: inv } = await iq;
        if (inv?.length) {
          await supabase.from('inventory').update({ reference: safe.cost }).in('id', inv.map((i: Record<string, unknown>) => i.id));
          tail = ` (${inv.length} item(s) de inventario sincronizados)`;
        }
      }
      return `Producto "${product.name}" actualizado (${Object.keys(safe).join(', ')}).${tail}`;
    }
    if (action === 'adjust_inventory') {
      const ad = data as Record<string, unknown>;
      const qty = normalizeStockQuantity(ad.quantity);
      if (qty === null) return 'Dime la cantidad exacta que queda (un número 0 o mayor).';
      const model = String(ad.model || '').toLowerCase();
      let iq = supabase.from('inventory').select('*').eq('status', 'Bueno');
      if (hasOwner) iq = iq.eq('owner', owner);
      if (model) iq = iq.ilike('model', `%${model}%`);
      if (ad.color) iq = iq.ilike('color', `%${String(ad.color)}%`);
      if (ad.size) iq = iq.ilike('size', `%${String(ad.size)}%`);
      if (ad.basket_location) iq = iq.ilike('basket_location', `%${String(ad.basket_location)}%`);
      const { data: items } = await iq.limit(5);
      const res = resolveSingleMatch(items);
      if (res.kind === 'none') return 'No encontré ese producto en inventario.';
      if (res.kind === 'ambiguous') {
        const list = res.candidates.map((i: Record<string, unknown>) => `• ${String(i.model || '')} ${String(i.color || '')} ${String(i.size || '')} (${String(i.basket_location || 's/canasta')}) — ${String(i.quantity)} u.`).join('\n');
        return `Hay varios items que coinciden, no ajusté ninguno. ¿Cuál?\n${list}`;
      }
      const item = res.item;
      const { error } = await supabase.from('inventory').update({ quantity: qty }).eq('id', item.id);
      if (error) throw new Error('No se pudo ajustar el stock: ' + error.message);
      return `Stock de ${item.model}${item.color ? ` ${item.color}` : ''} ajustado a ${qty} (antes ${item.quantity}).`;
    }
    if (action === 'move_inventory') {
      const md = data as Record<string, unknown>;
      const to = String(md.to_location || '').trim();
      if (!to) return '¿A qué canasta o ubicación lo muevo?';
      const model = String(md.model || '').toLowerCase();
      let iq = supabase.from('inventory').select('*').eq('status', 'Bueno');
      if (hasOwner) iq = iq.eq('owner', owner);
      if (model) iq = iq.ilike('model', `%${model}%`);
      if (md.color) iq = iq.ilike('color', `%${String(md.color)}%`);
      if (md.size) iq = iq.ilike('size', `%${String(md.size)}%`);
      if (md.from_location) iq = iq.ilike('basket_location', `%${String(md.from_location)}%`);
      const { data: items } = await iq.limit(5);
      const res = resolveSingleMatch(items);
      if (res.kind === 'none') return 'No encontré ese producto en inventario.';
      if (res.kind === 'ambiguous') {
        const list = res.candidates.map((i: Record<string, unknown>) => `• ${String(i.model || '')} ${String(i.color || '')} ${String(i.size || '')} (${String(i.basket_location || 's/canasta')})`).join('\n');
        return `Hay varios items que coinciden, no moví ninguno. ¿Cuál?\n${list}`;
      }
      const item = res.item;
      const { error } = await supabase.from('inventory').update({ basket_location: to }).eq('id', item.id);
      if (error) throw new Error('No se pudo mover el item: ' + error.message);
      return `${item.model}${item.color ? ` ${item.color}` : ''} movido de ${item.basket_location || 's/canasta'} a ${to}.`;
    }
    if (action === 'edit_expense') {
      const ed = data as Record<string, unknown>;
      const id = ed.expense_id;
      const updates = (ed.updates || {}) as Record<string, unknown>;
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updates)) {
        if (!(EDITABLE_EXPENSE_FIELDS as readonly string[]).includes(k)) continue;
        if (k === 'amount') {
          const a = parseCopAmount(v as string | number);
          if (a === null || a <= 0) return `Monto inválido ("${v}").`;
          safe.amount = a;
        } else if (k === 'category') {
          safe.category = normalizeExpenseCategory(v);
        } else if (k === 'expense_date') {
          if (!isValidDateString(v)) return `Fecha inválida ("${v}"). Usa el formato AAAA-MM-DD.`;
          safe.expense_date = v;
        } else if (k === 'description') {
          const s = String(v || '').trim();
          if (s) safe.description = s;
        }
      }
      if (!id || Object.keys(safe).length === 0) return 'No había cambios válidos para el gasto.';
      const { error } = await supabase.from('expenses').update(safe).eq('id', Number(id));
      if (error) throw new Error('No se pudo actualizar el gasto: ' + error.message);
      return `Gasto "${ed.description}" actualizado (${Object.keys(safe).join(', ')}).`;
    }
    if (action === 'resolve_alert') {
      const rd = data as Record<string, unknown>;
      const id = rd.alert_id;
      if (!id) return 'No identifiqué la alerta a resolver.';
      // Las alertas son deny-anon: se resuelven por el endpoint server-side.
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || 'No se pudo resolver la alerta');
      }
      return `Alerta "${rd.title || ''}" marcada como resuelta.`;
    }
    if (action === 'delete_product') {
      const pd = data as Record<string, unknown>;
      const id = pd.product_id;
      if (!id) return 'No identifiqué el producto a eliminar.';
      // El guard multi-tenant añade tenant_id; borra por id (ya resuelto en server).
      const { error } = await supabase.from('products').delete().eq('id', Number(id));
      if (error) throw new Error('No se pudo eliminar el producto: ' + error.message);
      return `Producto "${pd.name || ''}" (${pd.code || ''}) eliminado del catálogo.`;
    }
    return 'Acción no reconocida.';
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    setIsLoading(true);
    const summaries: string[] = [];
    let anyError = false;

    try {
      const hasOwner = await isOwnerSupported();

      if (pendingAction.action === 'multi_action' && pendingAction.actions) {
        for (const sub of pendingAction.actions) {
          try {
            const result = await execSingleAction(sub.action, sub.data, hasOwner);
            summaries.push('✓ ' + result);
          } catch (e: unknown) {
            anyError = true;
            summaries.push('✗ ' + sub.action + ': ' + (e instanceof Error ? e.message : 'Error'));
          }
        }
      } else {
        // Acción única: también capturamos el error aquí (antes caía al catch
        // externo sin dejar mensaje y con la barra de confirmación colgada).
        try {
          const result = await execSingleAction(pendingAction.action!, pendingAction.data, hasOwner);
          summaries.push(result);
        } catch (e: unknown) {
          anyError = true;
          summaries.push('No se pudo completar: ' + (e instanceof Error ? e.message : 'Error'));
        }
      }

      toast[anyError ? 'error' : 'success'](anyError ? 'Algo falló al guardar' : 'Listo');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: summaries.join('\n'),
        confirmed: !anyError,
      }]);
    } finally {
      // Siempre cerramos el flujo de confirmación, haya éxito o error, para no
      // dejar la barra "¿Confirmar?" colgada.
      setPendingAction(null);
      setPreConfirmPhoto(null);
      setPhotoStepDone(false);
      setIsLoading(false);
      scrollToBottom();
    }
  };

  const rejectAction = () => {
    setPendingAction(null);
    setPreConfirmPhoto(null);
    setPhotoStepDone(false);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Entendido. Puedes corregir y enviarme de nuevo.',
    }]);
    scrollToBottom();
  };

  // Keep track of text before recording started so we can append
  const preRecordTextRef = useRef('');
  const wasRecordingRef = useRef(false);
  // Última transcripción acumulada (prev + reconocido). Se envía ESTA al parar,
  // no el estado `input`, que podría no haberse re-renderizado todavía (closure
  // obsoleto): así nunca se manda texto incompleto/interino.
  const latestTranscriptRef = useRef('');

  // Auto-send when recording stops and there's text
  useEffect(() => {
    if (wasRecordingRef.current && !isRecording) {
      const text = (latestTranscriptRef.current || input).trim();
      if (text) sendMessage(text);
    }
    wasRecordingRef.current = isRecording;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const startRecording = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) { toast.error('Navegador no soporta voz'); return; }

    // Save current text so we can append
    preRecordTextRef.current = input;
    latestTranscriptRef.current = input;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'es-CO';
    recognition.interimResults = true;
    recognition.continuous = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalT = '', interimT = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalT += r[0].transcript;
        else interimT = r[0].transcript;
      }
      const newText = finalT || interimT;
      const prev = preRecordTextRef.current;
      const full = prev ? `${prev} ${newText}` : newText;
      latestTranscriptRef.current = full;
      setInput(full);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => { if (e.error !== 'no-speech') toast.error('Error de voz'); setIsRecording(false); };
    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    toast.success('Escuchando...');
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  const actionIcon = (action?: string) => {
    switch (action) {
      case 'create_order': return <ShoppingBag className="w-4 h-4 text-blue-500" />;
      case 'add_inventory': return <Package className="w-4 h-4 text-green-500" />;
      case 'search_inventory': return <Search className="w-4 h-4 text-purple-500" />;
      case 'search_orders': return <Search className="w-4 h-4 text-orange-500" />;
      case 'search_products': return <Search className="w-4 h-4 text-pink-500" />;
      case 'generate_report': return <Download className="w-4 h-4 text-emerald-500" />;
      case 'mark_defective': return <Package className="w-4 h-4 text-red-500" />;
      case 'return_order': return <ShoppingBag className="w-4 h-4 text-amber-500" />;
      case 'update_cost': return <Package className="w-4 h-4 text-cyan-500" />;
      case 'update_order_status': return <ShoppingBag className="w-4 h-4 text-emerald-500" />;
      case 'register_expense': return <Receipt className="w-4 h-4 text-red-500" />;
      case 'edit_order': return <ShoppingBag className="w-4 h-4 text-indigo-500" />;
      case 'multi_action': return <Sparkles className="w-4 h-4 text-purple-500" />;
      case 'monthly_summary': return <FileText className="w-4 h-4 text-indigo-500" />;
      case 'search_expenses': return <Receipt className="w-4 h-4 text-pink-500" />;
      case 'create_product': return <Package className="w-4 h-4 text-teal-500" />;
      case 'edit_product': return <Package className="w-4 h-4 text-indigo-500" />;
      case 'adjust_inventory': return <Package className="w-4 h-4 text-amber-500" />;
      case 'move_inventory': return <MapPin className="w-4 h-4 text-teal-500" />;
      case 'edit_expense': return <Receipt className="w-4 h-4 text-pink-500" />;
      case 'expense_totals_by_category': return <FileText className="w-4 h-4 text-pink-500" />;
      case 'search_alerts': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'resolve_alert': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'reprint_order_guide': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'delete_product': return <Trash2 className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  // Rótulo del tipo de acción (encabezado de la burbuja del asistente).
  const actionLabel = (action?: string): string => {
    switch (action) {
      case 'create_order': return 'Nuevo pedido';
      case 'add_inventory': return 'Agregar inventario';
      case 'search_inventory': return 'Buscar inventario';
      case 'search_orders': return 'Consultar pedidos';
      case 'search_products': return 'Buscar productos';
      case 'generate_report': return 'Generar reporte';
      case 'mark_defective': return 'Marcar defectuoso';
      case 'return_order': return 'Devolución';
      case 'update_cost': return 'Registrar costo';
      case 'update_order_status': return 'Cambiar estado';
      case 'register_expense': return 'Registrar gasto';
      case 'edit_order': return 'Editar pedido';
      case 'multi_action': return 'Varias acciones';
      case 'monthly_summary': return 'Resumen del mes';
      case 'search_expenses': return 'Buscar gastos';
      case 'create_product': return 'Crear producto';
      case 'edit_product': return 'Editar producto';
      case 'adjust_inventory': return 'Ajustar stock';
      case 'move_inventory': return 'Mover inventario';
      case 'edit_expense': return 'Editar gasto';
      case 'expense_totals_by_category': return 'Gastos por categoría';
      case 'search_alerts': return 'Alertas';
      case 'resolve_alert': return 'Resolver alerta';
      case 'reprint_order_guide': return 'Guía de despacho';
      case 'delete_product': return 'Eliminar producto';
      default: return '';
    }
  };

  // Icono del chip de ejemplo según su grupo.
  const exampleIcon = (group: ExampleGroup) => {
    switch (group) {
      case 'Crear pedido': return <ShoppingBag className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />;
      case 'Agregar inventario': return <Package className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />;
      case 'Buscar': return <Search className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />;
      case 'Pedidos': return <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />;
      case 'Cambiar estado': return <CheckCircle className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />;
      case 'Costo producto': return <DollarSign className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />;
      case 'Gasto general': return <Receipt className="w-3.5 h-3.5 text-pink-500 shrink-0 mt-0.5" />;
      case 'Devolución': return <RotateCcw className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />;
      case 'Defectuoso': return <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />;
      case 'Reporte': return <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />;
      default: return null;
    }
  };

  // Resumen de una sola línea de una sub-acción de multi_action, para el preview.
  const subActionSummary = (a: SubAction): string => {
    const raw = Array.isArray(a.data) ? (a.data[0] ?? {}) : (a.data ?? {});
    const d = raw as Record<string, unknown>;
    const money = (v: unknown) => formatCurrency(parseCopAmount(v as string | number) ?? Number(v) ?? 0);
    switch (a.action) {
      case 'register_expense':
        return `${String(d.description || 'gasto')}${d.amount ? ` — ${money(d.amount)}` : ''}`;
      case 'update_cost':
        return `${String(d.model || '')}${d.cost ? ` → ${money(d.cost)}` : ''}`.trim();
      case 'create_order':
        return `${String(d.client_name || '')}${d.value_to_collect ? ` — ${money(d.value_to_collect)}` : ''}`.trim();
      case 'update_order_status':
        return `→ ${String(d.new_status || '')}`;
      case 'mark_defective':
        return `${String(d.model || '')} x${String(d.quantity || 1)}`;
      case 'return_order':
        return `${String(d.order_code || d.client_name || '')}`;
      case 'add_inventory': {
        const items = Array.isArray(a.data) ? a.data : [a.data];
        const n = items.filter(Boolean).length;
        return `${n} item(s)`;
      }
      default:
        return '';
    }
  };

  const chatUI = (
    <div className="fixed inset-x-0 top-0 z-40 flex flex-col bg-gray-50 md:static md:inset-auto md:bottom-auto md:z-auto md:max-w-2xl md:mx-auto md:h-[calc(100dvh-3rem)] overflow-hidden" style={{ bottom: 'calc(6.5rem + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header — compact on mobile */}
      <div className="px-3 py-2 border-b border-gray-100 shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shrink-0 text-base md:text-lg">
            {config.logo && !config.logo.startsWith('http')
              ? <span aria-hidden>{config.logo}</span>
              : <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-white" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-sm md:text-lg leading-tight truncate">Asistente {config.name}</h1>
            <p className="text-[10px] md:text-xs text-gray-500 truncate">Pedidos, inventario, consultas</p>
          </div>
          <button
            onClick={() => setHelpOpen(true)}
            className="p-2 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600 transition"
            title="¿Qué puedo hacer?"
            aria-label="Ayuda del asistente"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setArchiveOpen(true)}
            className="p-2 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition"
            title="Nuevo día de trabajo — guarda el chat en el librito"
            aria-label="Nuevo día de trabajo / librito"
          >
            <BookOpen className="w-4 h-4" />
          </button>
          {messages.length > 0 && (
            <button onClick={clearChat} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition" title="Limpiar chat (sin guardar)" aria-label="Limpiar chat">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {helpOpen && <AssistantHelpModal onClose={() => setHelpOpen(false)} />}

      {archiveOpen && (
        <WorkdayArchiveModal
          hasActiveChat={messages.length > 0}
          onClose={() => setArchiveOpen(false)}
          onSaveAndClear={() => {
            startNewWorkday();
            setArchiveOpen(false);
          }}
          onRestore={restoreWorkday}
        />
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="py-3 md:py-8 text-gray-400">
            <div className="text-center mb-3">
              <div className="w-14 h-14 mx-auto mb-2 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-2xl shadow-md">
                <span aria-hidden>{config.logo && !config.logo.startsWith('http') ? config.logo : '✨'}</span>
              </div>
              <p className="text-base md:text-lg font-semibold text-gray-700 mb-0.5">Hola, soy tu asistente</p>
              <p className="text-xs md:text-sm text-gray-500 px-4">Háblame o escríbeme en tus palabras. Toca un ejemplo para empezar:</p>
            </div>
            {/* Un ejemplo por capacidad (cubre todo sin scroll infinito en móvil). */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto text-left">
              {buildAssistantExamples(config.categories)
                .filter((e, i, arr) => arr.findIndex(x => x.group === e.group) === i)
                .map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setInput(ex.text)}
                  className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-white border border-gray-100 shadow-sm hover:bg-purple-50 hover:border-purple-200 active:scale-[0.98] text-xs text-gray-700 text-left transition"
                >
                  {exampleIcon(ex.group)}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">{ex.group}</span>
                    <span className="block leading-snug text-gray-700">&quot;{ex.text}&quot;</span>
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="mt-3 mx-auto flex items-center justify-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 font-medium"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Ver todo lo que puedo hacer
            </button>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 md:px-4 md:py-2.5 text-[13px] md:text-sm ${
              msg.role === 'user'
                ? 'bg-purple-600 text-white rounded-br-md'
                : 'bg-gray-100 text-gray-800 rounded-bl-md'
            }`}>
              {msg.action && msg.role === 'assistant' && actionLabel(msg.action) && (
                <div className="flex items-center gap-1.5 mb-1 text-xs font-medium text-gray-500">
                  {actionIcon(msg.action)}
                  {actionLabel(msg.action)}
                </div>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {/* Multi-action preview: TODAS las sub-acciones (gasto, costo,
                  estado, etc.), no solo el inventario. Así la usuaria confirma
                  viendo todo lo que se va a hacer, no a ciegas. */}
              {msg.action === 'multi_action' && msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.actions.map((a, j) => (
                    <div key={j} className="p-2 bg-purple-50 rounded-lg text-xs border border-purple-100 flex items-center gap-1.5">
                      {actionIcon(a.action)}
                      <span className="font-medium">{actionLabel(a.action) || a.action}:</span>
                      <span className="text-gray-600 truncate">{subActionSummary(a)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Order preview */}
              {msg.action === 'create_order' && msg.data && (
                <div className="mt-2 p-3 bg-blue-50 rounded-xl text-xs space-y-1 border border-blue-100">
                  {Object.entries(msg.data as Record<string, unknown>).filter(([, v]) => v).map(([k, v]) => (
                    <p key={k}><span className="font-medium">{k}:</span> {k === 'value_to_collect' ? formatCurrency(Number(v)) : String(v)}</p>
                  ))}
                </div>
              )}

              {/* Inventory items preview */}
              {(msg.action === 'add_inventory' || msg.action === 'multi_action') && (() => {
                // Extract inventory items from data or from multi_action sub-actions
                let items: Array<Record<string, unknown>> = [];
                if (msg.action === 'add_inventory' && msg.data) {
                  items = Array.isArray(msg.data) ? msg.data : [msg.data];
                } else if (msg.action === 'multi_action' && msg.actions) {
                  const invAction = msg.actions.find(a => a.action === 'add_inventory');
                  if (invAction?.data) items = Array.isArray(invAction.data) ? invAction.data : [invAction.data];
                }
                items = items.filter(i => i.model || i.quantity);
                if (!items.length) return null;
                return (
                <div className="mt-2 space-y-1">
                  {items.map((item, j) => (
                    <div key={j} className="p-2 bg-green-50 rounded-lg text-xs border border-green-100">
                      <span className="font-medium">{item.quantity ? `${item.quantity}x ` : ''}{item.model ? String(item.model) : 'Producto'}</span>
                      {item.color ? <span> {String(item.color)}</span> : null}
                      {item.size ? <span> T.{String(item.size)}</span> : null}
                      {item.basket_location ? <span> → {String(item.basket_location)}</span> : null}
                    </div>
                  ))}
                </div>
                );
              })()}

              {/* Search results — clickable */}
              {msg.results && msg.results.length > 0 && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {msg.results.slice(0, 10).map((r, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSelectedItem(r); }}
                      className="w-full p-2 bg-white rounded-lg text-xs border border-gray-200 text-left hover:bg-purple-50 hover:border-purple-200 transition flex items-center gap-2 cursor-pointer active:bg-purple-100"
                    >
                      {r.image_url ? <img src={String(r.image_url)} alt="" className="w-8 h-8 rounded object-cover shrink-0" /> : null}
                      <div className="min-w-0 flex-1">
                        {r.model ? <span className="font-medium">{String(r.model)}</span> : null}
                        {r.client_name ? <span className="font-medium">{String(r.client_name)}</span> : null}
                        {r.code && !r.model && !r.client_name ? <span className="font-medium font-mono text-purple-600">{String(r.code)}</span> : null}
                        {r.name && !r.model && !r.client_name ? <span className="font-medium"> {String(r.name)}</span> : null}
                        {r.color ? <span> {String(r.color)}</span> : null}
                        {r.size ? <span> T.{String(r.size)}</span> : null}
                        {r.quantity ? <span> Cant: {String(r.quantity)}</span> : null}
                        {r.basket_location ? <span> {String(r.basket_location)}</span> : null}
                        {r.cost && !r.value_to_collect ? <span className="ml-1 text-green-600">{formatCurrency(Number(r.cost))}</span> : null}
                        {r.value_to_collect ? <span> {formatCurrency(Number(r.value_to_collect))}</span> : null}
                        {r.delivery_status ? <span className="ml-1 text-purple-600">[{String(r.delivery_status)}]</span> : null}
                      </div>
                      <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {msg.confirmed && <span className="inline-block mt-1 text-green-600 text-xs font-medium">✓ Guardado</span>}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Photo prompt BEFORE confirmation (for inventory actions) */}
      {pendingAction && !photoStepDone && preConfirmPhoto !== null && (
        <PhotoBeforeConfirm
          state={preConfirmPhoto}
          onStateChange={setPreConfirmPhoto}
          onSkip={() => setPhotoStepDone(true)}
        />
      )}

      {/* Confirmation bar (shows after photo step) — destructiva vs normal */}
      {pendingAction && photoStepDone && isDestructiveAction(pendingAction.action) && (
        <div className="mx-2 md:mx-4 mb-1 p-3 bg-red-50 border border-red-200 rounded-2xl animate-fadeIn shrink-0 shadow-sm">
          <p className="text-sm font-semibold text-red-800 mb-0.5 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Acción irreversible
          </p>
          <p className="text-[12px] text-red-700 mb-2">
            Para eliminar, escribe <span className="font-bold">{DESTRUCTIVE_CONFIRM_PHRASE}</span> en el cuadro de abajo y envía. O toca Cancelar.
          </p>
          <button onClick={rejectAction} disabled={isLoading} className="w-full flex items-center justify-center gap-1.5 bg-white border border-gray-300 text-gray-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50 active:scale-95 transition disabled:opacity-50">
            <X className="w-5 h-5" /> Cancelar
          </button>
        </div>
      )}
      {pendingAction && photoStepDone && !isDestructiveAction(pendingAction.action) && (
        <div className="mx-2 md:mx-4 mb-1 p-3 bg-yellow-50 border border-yellow-200 rounded-2xl animate-fadeIn shrink-0 shadow-sm">
          <p className="text-sm font-semibold text-yellow-900 mb-0.5">¿Confirmar esta acción?</p>
          <p className="text-[11px] text-yellow-700 mb-2">Toca un botón o dime <span className="font-semibold">&quot;sí&quot;</span> / <span className="font-semibold">&quot;no&quot;</span> por voz.</p>
          <div className="flex gap-2">
            <button onClick={confirmAction} disabled={isLoading} className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-green-700 active:scale-95 transition disabled:opacity-50">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Confirmar
            </button>
            <button onClick={rejectAction} disabled={isLoading} className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-gray-300 text-gray-700 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 active:scale-95 transition disabled:opacity-50">
              <X className="w-5 h-5" /> Corregir
            </button>
          </div>
        </div>
      )}

      {/* Input area — safe-area-aware for iOS */}
      <div className="border-t border-gray-200 px-3 pt-2 pb-2 bg-white shrink-0" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-end gap-2">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading}
            aria-label={isRecording ? 'Detener grabación de voz' : 'Grabar mensaje por voz'}
            className={`relative flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition active:scale-95 ${
              isRecording ? 'bg-red-500 text-white recording-pulse' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Pedido, inventario, consulta..."
            rows={1}
            enterKeyHint="send"
            autoCapitalize="sentences"
            className="flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-2.5 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent max-h-24"
            style={{ minHeight: '44px' }}
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            aria-label="Enviar mensaje"
            className="flex-shrink-0 w-11 h-11 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 active:scale-95 transition disabled:opacity-40"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

    </div>
  );

  return (
    <>
      {chatUI}

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {/* Dispatch Guide Modal with font size selector + isolated print */}
      {showGuide && (
        <DispatchGuide
          order={{
            order_code: String(showGuide.order_code ?? ''),
            client_name: String(showGuide.client_name ?? ''),
            phone: String(showGuide.phone ?? ''),
            address: String(showGuide.address ?? ''),
            complement: String(showGuide.complement ?? ''),
            product_ref: String(showGuide.product_ref ?? ''),
            detail: String(showGuide.detail ?? ''),
            value_to_collect: Number(showGuide.value_to_collect ?? 0),
            comment: String(showGuide.comment ?? ''),
            payment_timing: (showGuide.payment_timing as 'Anticipado' | 'ContraEntrega' | 'Mixto' | 'Otro' | '' | undefined) ?? '',
            prepaid_amount: Number(showGuide.prepaid_amount ?? 0),
          }}
          onClose={() => setShowGuide(null)}
        />
      )}
      {/* Product/Item Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end md:items-center justify-center" onClick={() => setSelectedItem(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-sm max-h-[85dvh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Photo */}
            {selectedItem.image_url ? (
              <button
                type="button"
                onClick={() => setLightboxSrc(String(selectedItem.image_url))}
                className="block w-full h-48 bg-gray-100 rounded-t-2xl md:rounded-t-2xl overflow-hidden cursor-zoom-in"
                aria-label="Ver foto ampliada"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={String(selectedItem.image_url)} alt="" className="w-full h-full object-cover" />
              </button>
            ) : null}
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">
                {String(selectedItem.model || selectedItem.client_name || selectedItem.name || 'Detalle')}
              </h3>
              <button onClick={() => setSelectedItem(null)} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Cerrar detalle">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            {/* Details */}
            <div className="overflow-y-auto flex-1 p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(selectedItem)
                  .filter(([k, v]) => v && !['id', 'created_at', 'owner', 'image_url'].includes(k))
                  .map(([k, v]) => {
                    const labels: Record<string, string> = {
                      model: 'Modelo', color: 'Color', size: 'Talla', quantity: 'Cantidad',
                      basket_location: 'Canasta', category: 'Categoría', type: 'Tipo',
                      status: 'Estado', observations: 'Observaciones', reference: 'Costo ref.',
                      product_id: 'ID Producto', verified: 'Verificado',
                      client_name: 'Cliente', phone: 'Teléfono', address: 'Dirección',
                      complement: 'Complemento', detail: 'Detalle', comment: 'Comentario',
                      value_to_collect: 'Valor', delivery_status: 'Estado',
                      order_code: 'Código', order_date: 'Fecha', vendor: 'Vendedor',
                      product_ref: 'Referencia', code: 'Código', name: 'Nombre', cost: 'Costo',
                    };
                    const label = labels[k] || k;
                    const isMoneyField = ['value_to_collect', 'cost', 'reference', 'payment_cash', 'payment_transfer'].includes(k);
                    const display = isMoneyField ? formatCurrency(Number(v)) :
                      typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v);
                    return (
                      <div key={k} className={k === 'address' || k === 'detail' || k === 'observations' ? 'col-span-2' : ''}>
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="font-medium text-gray-800">{display}</p>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
