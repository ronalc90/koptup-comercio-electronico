import { describe, it, expect } from 'vitest';
import {
  ORDER_PHASE_FLOW,
  phaseLabel,
  phaseIndex,
  isPipelinePhase,
  nextPhase,
  prevPhase,
  canAdvance,
  advanceActionLabel,
  isValidTransition,
} from './phases';

describe('máquina de fases del pedido', () => {
  it('el flujo lineal es Confirmado→…→Entregado', () => {
    expect(ORDER_PHASE_FLOW).toEqual([
      'Confirmado', 'EnAlistamiento', 'Alistado', 'Enviado', 'Entregado',
    ]);
  });

  it('nextPhase avanza un paso y se detiene en Entregado', () => {
    expect(nextPhase('Confirmado')).toBe('EnAlistamiento');
    expect(nextPhase('EnAlistamiento')).toBe('Alistado');
    expect(nextPhase('Alistado')).toBe('Enviado');
    expect(nextPhase('Enviado')).toBe('Entregado');
    expect(nextPhase('Entregado')).toBeNull();
  });

  it('prevPhase retrocede un paso y se detiene en Confirmado', () => {
    expect(prevPhase('Entregado')).toBe('Enviado');
    expect(prevPhase('Confirmado')).toBeNull();
  });

  it('estados fuera del pipeline no avanzan', () => {
    for (const s of ['Pagado', 'Devolucion', 'Cancelado']) {
      expect(isPipelinePhase(s)).toBe(false);
      expect(nextPhase(s)).toBeNull();
      expect(canAdvance(s)).toBe(false);
    }
  });

  it('phaseIndex ubica y -1 para desconocidos', () => {
    expect(phaseIndex('Alistado')).toBe(2);
    expect(phaseIndex('Pagado')).toBe(-1);
    expect(phaseIndex(null)).toBe(-1);
  });

  it('etiquetas humanas: Enviado=Despachado, EnAlistamiento=En alistamiento', () => {
    expect(phaseLabel('Enviado')).toBe('Despachado');
    expect(phaseLabel('EnAlistamiento')).toBe('En alistamiento');
    expect(phaseLabel('Devolucion')).toBe('Devolución');
    expect(phaseLabel(null)).toBe('—');
    expect(phaseLabel('Otro')).toBe('Otro');
  });

  it('advanceActionLabel describe la acción de avanzar', () => {
    expect(advanceActionLabel('Confirmado')).toBe('Iniciar alistamiento');
    expect(advanceActionLabel('EnAlistamiento')).toBe('Marcar alistado');
    expect(advanceActionLabel('Alistado')).toBe('Despachar');
    expect(advanceActionLabel('Enviado')).toBe('Marcar entregado');
    expect(advanceActionLabel('Entregado')).toBeNull();
  });

  it('transiciones válidas: ±1 en pipeline, excepciones desde cualquier fase', () => {
    expect(isValidTransition('Confirmado', 'EnAlistamiento')).toBe(true); // avanzar
    expect(isValidTransition('Alistado', 'EnAlistamiento')).toBe(true); // retroceder
    expect(isValidTransition('Confirmado', 'Alistado')).toBe(false); // salto de 2
    expect(isValidTransition('Confirmado', 'Cancelado')).toBe(true); // excepción
    expect(isValidTransition('Enviado', 'Devolucion')).toBe(true); // excepción
    expect(isValidTransition('Cancelado', 'Confirmado')).toBe(true); // reanudar
    expect(isValidTransition('Cancelado', 'Enviado')).toBe(false); // no reanuda a media
    expect(isValidTransition('Alistado', 'Alistado')).toBe(true); // idempotente
  });
});
