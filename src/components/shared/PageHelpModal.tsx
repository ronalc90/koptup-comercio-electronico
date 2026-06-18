'use client';

import { X, HelpCircle } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export interface HelpSection {
  title: string;
  items: string[];
}

export interface PageHelpContent {
  title: string;
  subtitle: string;
  intro: string;
  sections: HelpSection[];
  tip?: string;
  accentFrom?: string;
  accentTo?: string;
}

interface PageHelpModalProps {
  content: PageHelpContent;
  onClose: () => void;
}

export default function PageHelpModal({ content, onClose }: PageHelpModalProps) {
  const from = content.accentFrom ?? '#7c3aed';
  const to = content.accentTo ?? '#9061f9';

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg bg-white rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
            >
              <HelpCircle className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900">{content.title}</h2>
              <p className="text-xs text-gray-500">{content.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3 flex-1 min-h-0">
          <p className="text-sm text-gray-700 leading-relaxed">{content.intro}</p>

          {content.sections.map((s) => (
            <div key={s.title} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <h3 className="text-sm font-bold text-gray-900 mb-1.5">{s.title}</h3>
              <ul className="space-y-1 text-xs text-gray-700">
                {s.items.map((it, i) => (
                  <li key={i} className="flex gap-2 leading-relaxed">
                    <span className="text-gray-400 shrink-0">•</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {content.tip && (
            <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-3 text-xs text-gray-700">
              <strong className="text-purple-700">Tip:</strong> {content.tip}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 shrink-0">
          <button
            onClick={onClose}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

export function HelpButton({
  onClick,
  className,
  label = 'Ayuda',
  icon,
}: {
  onClick: () => void;
  className?: string;
  label?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        className ??
        'flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-colors'
      }
      title="¿Qué hace esta pantalla?"
      aria-label={label}
    >
      {icon ?? <HelpCircle className="h-4 w-4" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
