'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Send, Sparkles, Check, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/utils';
import type { ParsedOrder, ChatMessage } from '@/lib/types';

interface AIOrderInputProps {
  onOrderConfirmed: (order: ParsedOrder) => void;
}

export default function AIOrderInput({ onOrderConfirmed }: AIOrderInputProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<ParsedOrder | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    scrollToBottom();

    try {
      const res = await fetch('/api/ai/parse-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: messages.slice(-6),
        }),
      });

      const data = await res.json();

      // Errores/degradación discriminables (ej. IA no disponible): si el servidor
      // mandó un mensaje conversacional, lo mostramos como respuesta del asistente
      // en vez de lanzar, para no romper el flujo ni perder el contexto.
      if (!res.ok && !data?.message) {
        throw new Error(data.error || 'Error al procesar');
      }

      const status: 'complete' | 'needs_clarification' | 'not_order' | undefined = data.status;

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.message || 'Pedido procesado',
        parsedOrder: status === 'complete' ? data.order : data.partial,
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Solo abrimos la tarjeta de confirmación cuando el pedido está COMPLETO y
      // validado. Si falta info, las preguntas ya van en data.message y el usuario
      // responde en el siguiente turno (el contexto se mantiene).
      if (status === 'complete' && data.order) {
        setPendingOrder(data.order);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(msg);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}` }]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
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

    if (!SpeechRecognitionAPI) {
      toast.error('Tu navegador no soporta reconocimiento de voz');
      return;
    }

    // Save current input so we can append new voice to it
    preRecordTextRef.current = input;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'es-CO';
    recognition.interimResults = true;
    // continuous: no cortar a media frase en dictados largos; el envío ocurre
    // cuando el usuario detiene la grabación (useEffect de auto-envío).
    recognition.continuous = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript = result[0].transcript;
        }
      }
      const newText = finalTranscript || interimTranscript;
      const prev = preRecordTextRef.current;
      setInput(prev ? `${prev} ${newText}` : newText);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('Speech error:', event.error);
      if (event.error !== 'no-speech') {
        toast.error('Error de reconocimiento de voz');
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    toast.success('Escuchando... Habla el pedido');
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  const confirmOrder = () => {
    if (pendingOrder) {
      onOrderConfirmed(pendingOrder);
      setPendingOrder(null);
      setMessages([]);
      toast.success('Pedido confirmado');
    }
  };

  const rejectOrder = () => {
    setPendingOrder(null);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Entendido. Puedes enviarme el pedido de nuevo con las correcciones.'
    }]);
    scrollToBottom();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Sparkles className="w-12 h-12 mx-auto mb-3 text-purple-300" />
            <p className="text-lg font-medium text-gray-500">Asistente de Pedidos</p>
            <p className="text-sm mt-2">Pega el texto del pedido, escríbelo o usa el micrófono</p>
            <div className="mt-4 text-xs text-gray-400 space-y-1">
              <p>Ejemplo: &ldquo;Carlos Sanabria 3203436512</p>
              <p>Calle 80A #116B-82, Multifamiliares el Cortijo</p>
              <p>Clásica talla 40 miel $60.000&rdquo;</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user'
                ? 'bg-purple-600 text-white rounded-br-md'
                : 'bg-gray-100 text-gray-800 rounded-bl-md'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {msg.parsedOrder && (
                <div className={`mt-2 p-3 rounded-xl text-xs space-y-1 ${
                  msg.role === 'user' ? 'bg-purple-700/50' : 'bg-white border border-gray-200'
                }`}>
                  <p className="font-semibold text-sm mb-2">Datos extraídos:</p>
                  {msg.parsedOrder.client_name && <p><span className="font-medium">Cliente:</span> {msg.parsedOrder.client_name}</p>}
                  {msg.parsedOrder.phone && <p><span className="font-medium">Tel:</span> {msg.parsedOrder.phone}</p>}
                  {msg.parsedOrder.address && <p><span className="font-medium">Dir:</span> {msg.parsedOrder.address}</p>}
                  {msg.parsedOrder.complement && <p><span className="font-medium">Comp:</span> {msg.parsedOrder.complement}</p>}
                  {msg.parsedOrder.detail && <p><span className="font-medium">Detalle:</span> {msg.parsedOrder.detail}</p>}
                  {msg.parsedOrder.value_to_collect > 0 && <p><span className="font-medium">Valor:</span> {formatCurrency(msg.parsedOrder.value_to_collect)}</p>}
                </div>
              )}
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

      {/* Pending order confirmation */}
      {pendingOrder && (
        <div className="mx-4 mb-3 p-4 bg-green-50 border border-green-200 rounded-xl animate-fadeIn">
          <p className="font-semibold text-green-800 text-sm mb-3">¿Confirmar este pedido?</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-green-700 mb-3">
            <p><span className="font-medium">Cliente:</span> {pendingOrder.client_name}</p>
            <p><span className="font-medium">Tel:</span> {pendingOrder.phone}</p>
            <p className="col-span-2"><span className="font-medium">Dir:</span> {pendingOrder.address}{pendingOrder.complement ? `, ${pendingOrder.complement}` : ''}</p>
            <p><span className="font-medium">Valor:</span> {formatCurrency(pendingOrder.value_to_collect)}</p>
            <p><span className="font-medium">Producto:</span> {pendingOrder.detail}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={confirmOrder} className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 transition">
              <Check className="w-4 h-4" /> Confirmar
            </button>
            <button onClick={rejectOrder} className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition">
              <X className="w-4 h-4" /> Corregir
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-gray-200 p-3 bg-white">
        <div className="flex items-end gap-2">
          {/* Voice button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`relative flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition ${
              isRecording
                ? 'bg-red-500 text-white recording-pulse'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            disabled={isLoading}
            aria-label={isRecording ? 'Detener grabación de voz' : 'Grabar pedido por voz'}
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Pega el pedido aquí o usa el micrófono..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent max-h-32"
            style={{ minHeight: '42px' }}
            disabled={isLoading}
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-11 h-11 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Enviar pedido"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
