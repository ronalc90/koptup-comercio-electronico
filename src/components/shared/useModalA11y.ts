import { useEffect, type RefObject } from 'react';

/**
 * Accesibilidad mínima y consistente para modales/diálogos:
 *   - cerrar con Escape,
 *   - bloquear el scroll del fondo mientras el modal está abierto,
 *   - mover el foco al elemento indicado al abrir (input de confirmación, etc.).
 *
 * Pensado para usarse junto con `role="dialog"` + `aria-modal="true"` en el
 * contenedor. Unifica el comportamiento que antes solo tenían un par de modales.
 */
export function useModalA11y(
  onClose: () => void,
  opts?: { initialFocusRef?: RefObject<HTMLElement | null>; active?: boolean },
): void {
  const active = opts?.active ?? true;
  const initialFocusRef = opts?.initialFocusRef;
  useEffect(() => {
    // `active` permite usar el hook con modales que se renderizan inline tras un
    // flag (sin violar las reglas de hooks): cuando está cerrado, no hace nada.
    if (!active) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foco inicial (el nodo ya está montado).
    if (initialFocusRef?.current) initialFocusRef.current.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // onClose se asume estable; si cambia, el efecto se re-suscribe.
  }, [onClose, active, initialFocusRef]);
}
