'use client';

import { X, Sparkles, ShoppingBag, Package, Search, CheckCircle, RotateCcw, AlertTriangle, DollarSign, Receipt, FileText, MessageSquare } from 'lucide-react';

interface Section {
  icon: React.ReactNode;
  title: string;
  color: string;
  examples: string[];
}

const SECTIONS: Section[] = [
  {
    icon: <ShoppingBag className="w-4 h-4" />,
    title: 'Crear pedidos',
    color: 'bg-blue-50 text-blue-700 border-blue-100',
    examples: [
      '"Carlos 3113339988 Cr 15 #80-25 vaquita blanca talla 38 $85.000"',
      '"Pedido para María, Cll 72 #14-33, clásica negra, 90 mil"',
      '"Juan 3201234567 Chía, maxisaco cool gris, $110.000, ya pagó por Nequi"',
    ],
  },
  {
    icon: <Package className="w-4 h-4" />,
    title: 'Agregar inventario',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    examples: [
      '"Llegaron 5 vaquitas blancas talla 38 en C03 a 15000 cada una"',
      '"Puse 3 maxisacos gris cool en C08 a $45.000"',
      '"10 almohadas rosadas canasta A02, $18 mil"',
    ],
  },
  {
    icon: <Search className="w-4 h-4" />,
    title: 'Buscar inventario y catálogo',
    color: 'bg-amber-50 text-amber-700 border-amber-100',
    examples: [
      '"¿Cuántas vaquitas talla 38 tengo?"',
      '"¿Dónde está la pantufla stitch azul?"',
      '"Muéstrame las maxisacos"',
      '"¿Cuánto cuesta la clásica?"',
    ],
  },
  {
    icon: <CheckCircle className="w-4 h-4" />,
    title: 'Cambiar estado del pedido',
    color: 'bg-purple-50 text-purple-700 border-purple-100',
    examples: [
      '"El pedido de Carlos ya lo entregaron"',
      '"Bogo me pagó el de María"',
      '"El de Juan lo mandé ayer"',
      '"Cancela el pedido #4041302"',
      '"Ya me consignaron el de Paola, me llegó por transferencia 85 mil"',
    ],
  },
  {
    icon: <DollarSign className="w-4 h-4" />,
    title: 'Actualizar costo de producto',
    color: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    examples: [
      '"Las pantuflas vaquita me costaron 15000 cada una"',
      '"Sube el costo de la maxisaco ovejero a 45.000"',
      '"El costo de las clásicas blancas es $12.500"',
    ],
  },
  {
    icon: <Receipt className="w-4 h-4" />,
    title: 'Registrar gasto general',
    color: 'bg-pink-50 text-pink-700 border-pink-100',
    examples: [
      '"Pagué 800 mil de arriendo"',
      '"Gasté 25.000 en bolsas de empaque"',
      '"Invertí 150000 en publicidad de Facebook"',
      '"Pagué la luz: 85 mil"',
    ],
  },
  {
    icon: <RotateCcw className="w-4 h-4" />,
    title: 'Devoluciones',
    color: 'bg-orange-50 text-orange-700 border-orange-100',
    examples: [
      '"Me devolvieron el pedido de Carlos, dice que le quedó grande"',
      '"Devolución del #4041301, el color no le gustó"',
    ],
  },
  {
    icon: <AlertTriangle className="w-4 h-4" />,
    title: 'Productos defectuosos',
    color: 'bg-red-50 text-red-700 border-red-100',
    examples: [
      '"Esta pantufla vaquita azul está rota"',
      '"Tengo 3 maxisacos con manchas"',
      '"1 almohada rosada llegó defectuosa"',
    ],
  },
  {
    icon: <FileText className="w-4 h-4" />,
    title: 'Reportes y resúmenes',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    examples: [
      '"Dame el reporte de hoy"',
      '"Exporta los pedidos a Excel"',
      '"¿Cuánto he vendido este mes?"',
      '"Ganancias de marzo"',
    ],
  },
  {
    icon: <Package className="w-4 h-4" />,
    title: 'Catálogo: crear y editar productos',
    color: 'bg-teal-50 text-teal-700 border-teal-100',
    examples: [
      '"Crea el producto código C001, [nombre], $50.000"',
      '"Cambia el nombre del producto C001 a ..."',
      '"Sube el costo del C001 a 60 mil"',
      '"Desactiva el producto C001"',
    ],
  },
  {
    icon: <Package className="w-4 h-4" />,
    title: 'Ajustar y mover inventario',
    color: 'bg-amber-50 text-amber-700 border-amber-100',
    examples: [
      '"Corrige el stock de [producto] a 8"',
      '"Quedan 0 de [producto] en la C03"',
      '"Pasa las [producto] de la C03 a la C10"',
    ],
  },
  {
    icon: <Receipt className="w-4 h-4" />,
    title: 'Gastos: desglose, rango y editar',
    color: 'bg-pink-50 text-pink-700 border-pink-100',
    examples: [
      '"¿En qué gasté este mes?"',
      '"Gastos entre el 1 y el 15 de junio"',
      '"El arriendo eran 850 mil, no 800"',
    ],
  },
  {
    icon: <AlertTriangle className="w-4 h-4" />,
    title: 'Alertas del negocio',
    color: 'bg-amber-50 text-amber-700 border-amber-100',
    examples: [
      '"¿Qué alertas tengo?"',
      '"Resuelve la alerta de stock bajo"',
    ],
  },
  {
    icon: <FileText className="w-4 h-4" />,
    title: 'Guía de despacho',
    color: 'bg-blue-50 text-blue-700 border-blue-100',
    examples: [
      '"Dame la guía del pedido #4061801"',
      '"Imprime la guía de Carlos"',
    ],
  },
];

interface AssistantHelpModalProps {
  onClose: () => void;
}

export default function AssistantHelpModal({ onClose }: AssistantHelpModalProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900">¿Qué puede hacer el asistente?</h2>
              <p className="text-xs text-gray-500">Habla o escribe en tus palabras — él se encarga.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-3 flex-1 min-h-0">
          {/* Cómo se comporta */}
          <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-bold text-gray-900">Cómo se comporta</h3>
            </div>
            <ul className="space-y-1.5 text-xs text-gray-700">
              <li className="flex gap-2">
                <span className="text-purple-500">•</span>
                <span>
                  <strong>Pregunta antes de guardar</strong> si falta algo crítico (dirección, costo,
                  ubicación). No inventa datos.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500">•</span>
                <span>
                  <strong>Pide confirmación</strong> antes de modificar pedidos, inventario o costos.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500">•</span>
                <span>
                  <strong>Reporta el valor exacto</strong> que guardó. Si el producto es ambiguo al
                  actualizar costo, lista candidatos y pide el nombre exacto — no adivina.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500">•</span>
                <span>
                  <strong>Puede hacer varias cosas en un mensaje</strong>. Ej: &quot;llegaron 5 maxisacos
                  a 45 mil y pagué 25 mil de transporte&quot; = agrega inventario + registra gasto en un
                  solo paso.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500">•</span>
                <span>
                  <strong>Reconoce voz</strong>: si oye algo raro (&quot;te desarmadas&quot; en vez de
                  &quot;almohadas&quot;), pregunta para confirmar.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500">•</span>
                <span>
                  <strong>No finge éxito</strong>: si algo falla o no encuentra el producto, lo dice
                  claro.
                </span>
              </li>
            </ul>
          </div>

          {/* Categorías */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">
            Ejemplos por tipo de acción
          </p>
          {SECTIONS.map((s) => (
            <div key={s.title} className={`rounded-xl border p-3 ${s.color}`}>
              <div className="flex items-center gap-2 mb-2">
                {s.icon}
                <h3 className="text-sm font-bold">{s.title}</h3>
              </div>
              <ul className="space-y-1 text-xs">
                {s.examples.map((ex) => (
                  <li key={ex} className="leading-relaxed">
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Tip final */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
            <strong className="text-gray-900">Tip:</strong> no necesitas usar palabras exactas —
            habla normal. El asistente interpreta &quot;pasaste plata&quot;, &quot;contraentrega&quot;, &quot;al entregar&quot;,
            &quot;ya me consignaron&quot;, etc. Si algo no te cuadra, respondé &quot;no&quot; y corregilo.
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3 shrink-0">
          <button
            onClick={onClose}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9061f9 100%)' }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
