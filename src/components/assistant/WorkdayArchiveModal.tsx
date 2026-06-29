'use client';

import { useState } from 'react';
import { BookOpen, X, RotateCcw, Trash2, CalendarDays, MessageSquare, HelpCircle, Save } from 'lucide-react';
import {
  listWorkdays,
  deleteWorkday,
  type Workday,
} from '@/lib/workdayArchive';
import { useModalA11y } from '@/components/shared/useModalA11y';

interface WorkdayArchiveModalProps {
  hasActiveChat: boolean;
  onClose: () => void;
  onSaveAndClear: () => void;
  onRestore: (workday: Workday) => void;
}

export default function WorkdayArchiveModal({ hasActiveChat, onClose, onSaveAndClear, onRestore }: WorkdayArchiveModalProps) {
  const [workdays, setWorkdays] = useState<Workday[]>(() => listWorkdays());
  const [showHelp, setShowHelp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  useModalA11y(onClose);

  const handleDelete = (id: string) => {
    deleteWorkday(id);
    setWorkdays(listWorkdays());
    setConfirmDelete(null);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900">Librito de días</h2>
              <p className="text-xs text-gray-500">Tus conversaciones guardadas</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowHelp((v) => !v)}
              className="rounded-lg p-2 text-gray-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
              title="¿Qué es el librito?"
              aria-label="Ayuda del librito"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Help section */}
        {showHelp && (
          <div className="border-b border-amber-100 bg-amber-50/60 px-5 py-3 text-xs text-gray-700 shrink-0">
            <p className="mb-1">
              <strong className="text-amber-800">¿Para qué sirve el librito?</strong> Guarda
              tu chat con el asistente como un capítulo del día. Cada “día de trabajo” queda
              archivado acá para que lo puedas recuperar cuando quieras.
            </p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>Pulsá <strong>“Guardar día y empezar de nuevo”</strong> para archivar el chat actual y dejar limpio para arrancar.</li>
              <li>Pulsá <strong>Restaurar</strong> en un día guardado para volver a cargarlo.</li>
              <li>También podés pedírselo al asistente por voz: <em>&ldquo;restaurá el chat del 15 de abril&rdquo;</em> o <em>&ldquo;cargame el día anterior&rdquo;</em>.</li>
              <li>Pulsá 🗑️ para borrar un día guardado (no se puede deshacer).</li>
            </ul>
          </div>
        )}

        {/* Save current chat */}
        {hasActiveChat && (
          <div className="border-b border-gray-100 px-5 py-3 shrink-0">
            <button
              onClick={onSaveAndClear}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-opacity"
            >
              <Save className="w-4 h-4" />
              Guardar día y empezar de nuevo
            </button>
            <p className="mt-1.5 text-[11px] text-gray-500 text-center">
              El chat actual quedará archivado acá como un nuevo capítulo.
            </p>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 flex-1 min-h-0">
          {workdays.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <BookOpen className="w-10 h-10 mx-auto mb-2 text-amber-200" />
              <p className="text-sm font-medium text-gray-600">Tu librito está vacío</p>
              <p className="text-xs mt-1">
                Cuando pulses el botón de <strong>Nuevo día</strong>, el chat actual quedará
                guardado acá.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {workdays.map((w) => (
                <li
                  key={w.id}
                  className="rounded-xl border border-amber-100 bg-amber-50/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {w.label}
                      </div>
                      <p className="mt-1 text-sm text-gray-800 line-clamp-2">{w.summary}</p>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                        <MessageSquare className="w-3 h-3" />
                        {w.messageCount} mensaje{w.messageCount === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => onRestore(w)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restaurar
                    </button>
                    {confirmDelete === w.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="inline-flex items-center justify-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                        >
                          Borrar
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(w.id)}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors"
                        aria-label="Borrar día"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
