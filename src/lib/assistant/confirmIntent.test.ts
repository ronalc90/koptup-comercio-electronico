import { describe, it, expect } from 'vitest';
import { detectConfirmIntent } from './confirmIntent';

describe('detectConfirmIntent: confirmar/cancelar por voz o texto', () => {
  it('detecta confirmaciones afirmativas en distintas formas', () => {
    for (const t of ['sí', 'Sí', 'si', 'sí, dale', 'dale', 'dale pues', 'confírmalo',
      'confirmo', 'ok', 'okey', 'listo', 'hazlo', 'de una', 'acepto', 'correcto',
      'perfecto', 'sí porfa', 'ok listo', 'sí gracias']) {
      expect(detectConfirmIntent(t), `"${t}"`).toBe('confirm');
    }
  });

  it('detecta negaciones/cancelaciones', () => {
    for (const t of ['no', 'No', 'nop', 'cancela', 'cancelar', 'mejor no',
      'no, cancela', 'corrige', 'corregir', 'espera', 'detente', 'negativo']) {
      expect(detectConfirmIntent(t), `"${t}"`).toBe('reject');
    }
  });

  it('si hay negación, gana sobre cualquier afirmación accidental', () => {
    expect(detectConfirmIntent('no, mejor cancela')).toBe('reject');
    expect(detectConfirmIntent('mejor no, corrige')).toBe('reject');
  });

  it('NO captura mensajes que aportan información (van al LLM)', () => {
    for (const t of [
      'sí, pero cambia la dirección',
      'sí 3 unidades',
      'no tengo el costo',
      'crea un pedido para Carlos',
      'el de María ya se entregó',
      'cámbialo a 50 mil',
      'agrega 2 cascos negros',
    ]) {
      expect(detectConfirmIntent(t), `"${t}"`).toBeNull();
    }
  });

  it('mensaje vacío o muy largo devuelve null', () => {
    expect(detectConfirmIntent('')).toBeNull();
    expect(detectConfirmIntent('   ')).toBeNull();
    expect(detectConfirmIntent('sí sí sí sí sí sí sí sí')).toBeNull(); // > 5 tokens
  });
});
