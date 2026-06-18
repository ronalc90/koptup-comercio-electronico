'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Send, Package, Check, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface ParsedInventoryItem {
  model: string;
  category: string;
  product_id: string;
  color: string;
  size: string;
  quantity: number;
  basket_location: string;
  type: string;
  observations: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  parsedItems?: ParsedInventoryItem[];
}

interface AIInventoryInputProps {
  onItemsConfirmed: (items: ParsedInventoryItem[]) => void;
}

export default function AIInventoryInput({ onItemsConfirmed }: AIInventoryInputProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingItems, setPendingItems] = useState<ParsedInventoryItem[] | null>(null);
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
      const res = await fetch('/api/ai/parse-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: messages.slice(-6),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar');
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.message || 'Items procesados',
        parsedItems: data.parsed ? data.items : data.partial,
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (data.parsed && data.items && data.items.length > 0) {
        setPendingItems(data.items);
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

  const startRecording = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      toast.error('Tu navegador no soporta reconocimiento de voz');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'es-CO';
    recognition.continuous = false;
    recognition.interimResults = true;

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
      setInput(finalTranscript || interimTranscript);
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
    toast.success('Escuchando... Describe el inventario');
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    if (input.trim()) {
      toast.success('Voz capturada. Revisa y envía.');
    }
  };

  const confirmItems = () => {
    if (pendingItems) {
      onItemsConfirmed(pendingItems);
      setPendingItems(null);
      setMessages([]);
      toast.success('Items confirmados');
    }
  };

  const rejectItems = () => {
    setPendingItems(null);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Entendido. Puedes describir el inventario de nuevo con las correcciones.'
    }]);
    scrollToBottom();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-3 text-purple-300" />
            <p className="text-lg font-medium text-gray-500">Asistente de Inventario</p>
            <p className="text-sm mt-2">Describe los items de inventario, escríbelos o usa el micrófono</p>
            <div className="mt-4 text-xs text-gray-400 space-y-1">
              <p>Ejemplo: &ldquo;10 pantuflas vaquita blanca talla 38 en canasta C015&rdquo;</p>
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

              {msg.parsedItems && msg.parsedItems.length > 0 && (
                <div className={`mt-2 p-3 rounded-xl text-xs space-y-2 ${
                  msg.role === 'user' ? 'bg-purple-700/50' : 'bg-white border border-gray-200'
                }`}>
                  <p className="font-semibold text-sm mb-2">Items extraídos:</p>
                  {msg.parsedItems.map((item, idx) => (
                    <div key={idx} className="space-y-0.5 border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                      {item.model && <p><span className="font-medium">Modelo:</span> {item.model}</p>}
                      {item.color && <p><span className="font-medium">Color:</span> {item.color}</p>}
                      {item.size && <p><span className="font-medium">Talla:</span> {item.size}</p>}
                      {item.quantity > 0 && <p><span className="font-medium">Cantidad:</span> {item.quantity}</p>}
                      {item.basket_location && <p><span className="font-medium">Canasta:</span> {item.basket_location}</p>}
                    </div>
                  ))}
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

      {/* Pending items confirmation */}
      {pendingItems && pendingItems.length > 0 && (
        <div className="mx-4 mb-3 p-4 bg-green-50 border border-green-200 rounded-xl animate-fadeIn">
          <p className="font-semibold text-green-800 text-sm mb-3">
            ¿Confirmar {pendingItems.length} item{pendingItems.length !== 1 ? 's' : ''} de inventario?
          </p>
          <div className="space-y-2 mb-3">
            {pendingItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-green-700">
                {item.model && <p><span className="font-medium">Modelo:</span> {item.model}</p>}
                {item.color && <p><span className="font-medium">Color:</span> {item.color}</p>}
                {item.size && <p><span className="font-medium">Talla:</span> {item.size}</p>}
                {item.quantity > 0 && <p><span className="font-medium">Cantidad:</span> {item.quantity}</p>}
                {item.basket_location && <p><span className="font-medium">Canasta:</span> {item.basket_location}</p>}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={confirmItems}
              className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 transition"
            >
              <Check className="w-4 h-4" /> Confirmar
            </button>
            <button
              onClick={rejectItems}
              className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition"
            >
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
            aria-label={isRecording ? 'Detener grabación de voz' : 'Grabar voz'}
            className={`relative flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition ${
              isRecording
                ? 'bg-red-500 text-white recording-pulse'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            disabled={isLoading}
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
            placeholder='Ej: "10 pantuflas vaquita blanca talla 38 en canasta C015"'
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent max-h-32"
            style={{ minHeight: '42px' }}
            disabled={isLoading}
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            aria-label="Enviar mensaje"
            className="flex-shrink-0 w-11 h-11 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
