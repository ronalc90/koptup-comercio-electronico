'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Send, Sparkles, Check, X, Loader2, Package, ShoppingBag, Search, MapPin, Download, Trash2, ChevronRight, HelpCircle, CheckCircle, RotateCcw, AlertTriangle, DollarSign, Receipt, FileText, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/UserContext';
import { useTenant } from '@/lib/TenantContext';
import { isOwnerSupported, isPaymentTimingSupported, courierPendingColumn } from '@/lib/db';
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

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    scrollToBottom();

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context: messages.slice(-10), owner }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'No se pudo procesar la solicitud');

      // Force confirmation for actions that modify data
      const modifyingActions = ['create_order', 'add_inventory', 'mark_defective', 'return_order',
        'update_order_status', 'register_expense', 'update_cost', 'multi_action'];
      const needsConf = data.needs_confirmation || modifyingActions.includes(data.action);

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.message || (data.action === 'chat' ? 'No entendí, ¿puedes repetirlo?' : '¿Confirmas esta acción?'),
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
          const params: Record<string, string> = { owner };
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
      const { data: existing } = await supabase.from('orders').select('id').gte('order_date', dateStr).lte('order_date', dateStr);
      const seq = (existing?.length || 0) + 1;
      const orderCode = generateOrderCode(today, seq);

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
        order_code: orderCode, client_name: orderData.client_name || '', phone: String(orderData.phone || ''),
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

      const { error } = await supabase.from('orders').insert(basePayload);
      if (error) throw error;

      // Sync inventario: descuenta (nunca negativo) o crea en cero con costo de referencia
      const orderQty = Math.max(1, Number(orderData.quantity) || 1);
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
      const imgUrl = preConfirmPhoto?.imageUrl || '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payloads = items.map(item => { const p: any = { model: item.model || '', category: item.category || (config.categories[0] ?? 'Otro'), product_id: item.product_id || '', color: item.color || '', size: item.size || '', quantity: Number(item.quantity) || 1, basket_location: item.basket_location || '', type: item.type || '', observations: item.observations || '', status: 'Bueno', verified: false, reference: 0, image_url: imgUrl }; if (hasOwner) p.owner = owner; return p; });
      const { error } = await supabase.from('inventory').insert(payloads);
      if (error) throw error;
      setPreConfirmPhoto(null);
      return `${items.length} item(s) agregados al inventario.${imgUrl ? ' Con foto.' : ''}`;
    }
    if (action === 'mark_defective') {
      const defData = data as Record<string, unknown>;
      const model = String(defData.model || '').toLowerCase();
      const qty = Number(defData.quantity) || 1;
      let invQuery = supabase.from('inventory').select('*').eq('status', 'Bueno').gt('quantity', 0);
      if (hasOwner) invQuery = invQuery.eq('owner', owner);
      if (model) invQuery = invQuery.ilike('model', `%${model}%`);
      if (defData.color) invQuery = invQuery.ilike('color', `%${String(defData.color)}%`);
      const { data: invItems } = await invQuery.limit(1);
      if (invItems?.length) {
        const item = invItems[0];
        await supabase.from('inventory').update({ quantity: Math.max(0, item.quantity - qty) }).eq('id', item.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const defPayload: any = { model: item.model, category: item.category, product_id: item.product_id, color: item.color, size: item.size, quantity: qty, basket_location: item.basket_location, type: item.type, observations: String(defData.observations || 'Defectuoso'), status: 'Malo', verified: false, reference: 0 };
        if (hasOwner) defPayload.owner = owner;
        await supabase.from('inventory').insert(defPayload);
        return `${qty} unidad(es) de ${item.model} marcadas como defectuosas.`;
      }
      return 'No encontré ese producto en inventario.';
    }
    if (action === 'return_order') {
      const retData = data as Record<string, unknown>;
      let oq = supabase.from('orders').select('*');
      if (hasOwner) oq = oq.eq('owner', owner);
      if (retData.order_code) oq = oq.eq('order_code', String(retData.order_code));
      else if (retData.client_name) oq = oq.ilike('client_name', `%${String(retData.client_name)}%`);
      const { data: found } = await oq.limit(1);
      if (found?.length) {
        const order = found[0];
        const mergedChanges: Record<string, unknown> = {
          delivery_status: 'Devolucion',
          comment: `${order.comment || ''} | Devolución: ${retData.reason || ''}`.trim(),
        };
        await supabase.from('orders').update(mergedChanges).eq('id', order.id);
        const detail = (order.detail || order.product_ref || '').toLowerCase();
        if (detail) { let iq = supabase.from('inventory').select('*').eq('status', 'Bueno'); if (hasOwner) iq = iq.eq('owner', owner); const { data: inv } = await iq; if (inv?.length) { const m = inv.find(i => detail.includes(i.model.toLowerCase()) || i.model.toLowerCase().includes(detail.split(' ')[0])); if (m) await supabase.from('inventory').update({ quantity: m.quantity + 1 }).eq('id', m.id); } }
        return `Pedido #${order.order_code} de ${order.client_name} → Devolución. Stock restaurado.`;
      }
      return 'No encontré ese pedido.';
    }
    if (action === 'update_order_status') {
      const sd = data as Record<string, unknown>;
      let oq = supabase.from('orders').select('*');
      if (hasOwner) oq = oq.eq('owner', owner);
      if (sd.order_code) oq = oq.eq('order_code', String(sd.order_code));
      else if (sd.client_name) oq = oq.ilike('client_name', `%${String(sd.client_name)}%`);
      oq = oq.order('created_at', { ascending: false });
      const { data: found } = await oq.limit(1);
      if (found?.length) {
        const order = found[0];
        const ns = String(sd.new_status || 'Entregado');
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
        if (ns === 'Entregado' && order.delivery_status === 'Confirmado') { const d = (order.detail || order.product_ref || '').toLowerCase(); if (d) { let iq = supabase.from('inventory').select('*').eq('status', 'Bueno').gt('quantity', 0); if (hasOwner) iq = iq.eq('owner', owner); const { data: inv } = await iq; if (inv) { const m = inv.find(i => d.includes(i.model.toLowerCase()) || i.model.toLowerCase().includes(d.split(' ')[0])); if (m) await supabase.from('inventory').update({ quantity: Math.max(0, m.quantity - 1) }).eq('id', m.id); } } }
        return `Pedido #${order.order_code} de ${order.client_name} → "${ns}".`;
      }
      return 'No encontré ese pedido.';
    }
    if (action === 'register_expense') {
      const ed = data as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = { description: String(ed.description || ''), amount: Number(ed.amount) || 0, category: String(ed.category || 'otro'), expense_date: new Date().toISOString().slice(0, 10) };
      if (hasOwner) p.owner = owner; if (ed.order_id) p.order_id = Number(ed.order_id); if (ed.product_ref) p.product_ref = String(ed.product_ref);
      const { error } = await supabase.from('expenses').insert(p);
      if (error) return 'Error al registrar gasto: ' + error.message;
      return `Gasto de ${formatCurrency(Number(ed.amount))} registrado: "${ed.description}".`;
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
      let pq = supabase.from('products').select('*');
      if (hasOwner) pq = pq.eq('owner', owner);
      pq = pq.ilike('name', `%${model}%`);
      const { data: prods, error: prodErr } = await pq.limit(5);
      if (prodErr) {
        return `Error consultando productos: ${prodErr.message}`;
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
        return `No pude guardar el costo: ${updErr.message}`;
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
    return 'Acción no reconocida.';
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    setIsLoading(true);

    try {
      const hasOwner = await isOwnerSupported();
      const summaries: string[] = [];

      if (pendingAction.action === 'multi_action' && pendingAction.actions) {
        for (const sub of pendingAction.actions) {
          try {
            const result = await execSingleAction(sub.action, sub.data, hasOwner);
            summaries.push('✓ ' + result);
          } catch (e: unknown) {
            summaries.push('✗ ' + sub.action + ': ' + (e instanceof Error ? e.message : 'Error'));
          }
        }
      } else {
        const result = await execSingleAction(pendingAction.action!, pendingAction.data, hasOwner);
        summaries.push(result);
      }

      const hasErrors = summaries.some(s => s.startsWith('✗'));
      toast[hasErrors ? 'error' : 'success'](hasErrors ? 'Algunas acciones fallaron' : 'Acciones ejecutadas');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: summaries.join('\n'),
        confirmed: true,
      }]);

      setPendingAction(null);
      setPreConfirmPhoto(null);
      setPhotoStepDone(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
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

  // Auto-send when recording stops and there's text
  useEffect(() => {
    if (wasRecordingRef.current && !isRecording && input.trim()) {
      sendMessage(input);
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
      setInput(prev ? `${prev} ${newText}` : newText);
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
      case 'register_expense': return <ShoppingBag className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  const chatUI = (
    <div className="fixed inset-x-0 top-0 z-40 flex flex-col bg-gray-50 md:static md:inset-auto md:bottom-auto md:z-auto md:max-w-2xl md:mx-auto md:h-[calc(100dvh-3rem)] overflow-hidden" style={{ bottom: 'calc(6.5rem + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header — compact on mobile */}
      <div className="px-3 py-2 border-b border-gray-100 shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-sm md:text-lg leading-tight">Asistente Meraki</h1>
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
          <div className="py-4 md:py-8 text-gray-400">
            <div className="text-center mb-4">
              <Sparkles className="w-10 h-10 md:w-14 md:h-14 mx-auto mb-2 text-purple-200" />
              <p className="text-base md:text-lg font-semibold text-gray-600 mb-0.5">Hola, soy tu asistente</p>
              <p className="text-xs md:text-sm text-gray-500 mb-1">Habla o escribe en tus palabras — toca un ejemplo para empezar:</p>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] md:text-xs text-purple-600 hover:text-purple-700 font-medium"
              >
                <HelpCircle className="w-3 h-3" />
                Ver todo lo que puedo hacer
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5 max-w-md mx-auto text-left">
              {[
                { group: 'Crear pedido', icon: <ShoppingBag className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />, text: '"Carlos 3203436512 Cr 15 #80-25 clásica miel talla 38 $60.000"' },
                { group: 'Crear pedido', icon: <ShoppingBag className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />, text: '"Pedido para María, Cll 72 #14-33, vaquita blanca, $85.000"' },
                { group: 'Crear pedido', icon: <ShoppingBag className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />, text: '"Juan 3201234567 Chía, maxisaco cool gris, 110 mil, ya pagó por Nequi"' },
                { group: 'Agregar inventario', icon: <Package className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />, text: '"Tengo 10 vaquitas talla 38 en C015 a $15.000 cada una"' },
                { group: 'Agregar inventario', icon: <Package className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />, text: '"Puse 3 maxisacos gris cool en C08 a 45 mil"' },
                { group: 'Buscar', icon: <Search className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />, text: '"¿Dónde están las pantuflas stitch azules?"' },
                { group: 'Buscar', icon: <Search className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />, text: '"¿Cuántas vaquitas talla 38 me quedan?"' },
                { group: 'Pedidos', icon: <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />, text: '"¿Cuántos pedidos hay hoy?"' },
                { group: 'Pedidos', icon: <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />, text: '"Pedidos pendientes de entrega"' },
                { group: 'Cambiar estado', icon: <CheckCircle className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />, text: '"El pedido de Carlos ya lo entregaron"' },
                { group: 'Cambiar estado', icon: <CheckCircle className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />, text: '"Bogo me pagó el de María, 85 mil"' },
                { group: 'Cambiar estado', icon: <CheckCircle className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />, text: '"Cancela el pedido #4041302"' },
                { group: 'Costo producto', icon: <DollarSign className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />, text: '"Las pantuflas vaquita me costaron $15.000 cada una"' },
                { group: 'Costo producto', icon: <DollarSign className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />, text: '"Sube el costo de la maxisaco ovejero a 45.000"' },
                { group: 'Gasto general', icon: <Receipt className="w-3.5 h-3.5 text-pink-500 shrink-0 mt-0.5" />, text: '"Pagué 800 mil de arriendo"' },
                { group: 'Gasto general', icon: <Receipt className="w-3.5 h-3.5 text-pink-500 shrink-0 mt-0.5" />, text: '"Gasté 25.000 en bolsas de empaque"' },
                { group: 'Devolución', icon: <RotateCcw className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />, text: '"Me devolvieron el pedido de Carlos, le quedó grande"' },
                { group: 'Defectuoso', icon: <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />, text: '"Esta pantufla vaquita azul está rota"' },
                { group: 'Reporte', icon: <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />, text: '"Dame el reporte de hoy"' },
                { group: 'Reporte', icon: <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />, text: '"¿Cuánto he vendido este mes?"' },
              ].map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setInput(ex.text.replace(/"/g, ''))}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-purple-50 border border-transparent hover:border-purple-100 text-xs text-gray-700 text-left transition"
                >
                  {ex.icon}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">{ex.group}</span>
                    <span className="block leading-snug">{ex.text}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 md:px-4 md:py-2.5 text-[13px] md:text-sm ${
              msg.role === 'user'
                ? 'bg-purple-600 text-white rounded-br-md'
                : 'bg-gray-100 text-gray-800 rounded-bl-md'
            }`}>
              {msg.action && msg.role === 'assistant' && (
                <div className="flex items-center gap-1.5 mb-1 text-xs font-medium text-gray-500">
                  {actionIcon(msg.action)}
                  {msg.action === 'create_order' && 'Nuevo pedido'}
                  {msg.action === 'add_inventory' && 'Agregar inventario'}
                  {msg.action === 'search_inventory' && 'Buscar inventario'}
                  {msg.action === 'search_orders' && 'Consultar pedidos'}
                  {msg.action === 'search_products' && 'Buscar productos'}
                  {msg.action === 'generate_report' && 'Generar reporte'}
                  {msg.action === 'mark_defective' && 'Marcar defectuoso'}
                  {msg.action === 'return_order' && 'Devolución'}
                  {msg.action === 'update_cost' && 'Registrar costo'}
                  {msg.action === 'update_order_status' && 'Cambiar estado'}
                  {msg.action === 'register_expense' && 'Registrar gasto'}
                </div>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>

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

      {/* Confirmation bar (shows after photo step) */}
      {pendingAction && photoStepDone && (
        <div className="mx-2 md:mx-4 mb-1 p-2 md:p-3 bg-yellow-50 border border-yellow-200 rounded-xl animate-fadeIn shrink-0">
          <p className="text-xs md:text-sm font-semibold text-yellow-800 mb-1.5">¿Confirmar esta acción?</p>
          <div className="flex gap-2">
            <button onClick={confirmAction} disabled={isLoading} className="flex-1 flex items-center justify-center gap-1 bg-green-600 text-white rounded-lg py-1.5 md:py-2 text-xs md:text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Confirmar
            </button>
            <button onClick={rejectAction} className="flex-1 flex items-center justify-center gap-1 bg-white border border-gray-300 text-gray-700 rounded-lg py-1.5 md:py-2 text-xs md:text-sm font-medium hover:bg-gray-50 transition">
              <X className="w-3.5 h-3.5" /> Corregir
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
            className={`relative flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${
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
            className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent max-h-20"
            style={{ minHeight: '40px' }}
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            aria-label="Enviar mensaje"
            className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 transition disabled:opacity-40"
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
