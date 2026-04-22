import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectArchiveIntent,
  findWorkdayByQuery,
  listWorkdays,
  saveWorkday,
  getWorkday,
  deleteWorkday,
} from './workdayArchive';

describe('detectArchiveIntent', () => {
  it('detecta intención de abrir el librito/lista', () => {
    expect(detectArchiveIntent('abre el librito')).toEqual({ kind: 'list' });
    expect(detectArchiveIntent('muéstrame el libro')).toEqual({ kind: 'list' });
    expect(detectArchiveIntent('ver dias guardados')).toEqual({ kind: 'list' });
    expect(detectArchiveIntent('lista los dias anteriores')).toEqual({ kind: 'list' });
  });

  it('detecta intención de restaurar una conversación', () => {
    const out = detectArchiveIntent('restaurar el chat del 15 de abril');
    expect(out?.kind).toBe('restore');
  });

  it('detecta variantes con acentos y mayúsculas', () => {
    expect(detectArchiveIntent('RESTAURAR chat del dia anterior')?.kind).toBe('restore');
    expect(detectArchiveIntent('cargá el chat de ayer')?.kind).toBe('restore');
  });

  it('ignora mensajes normales que no son pedidos del librito', () => {
    expect(detectArchiveIntent('hola asistente')).toBeNull();
    expect(detectArchiveIntent('crear pedido para Carlos')).toBeNull();
    expect(detectArchiveIntent('cuánto he vendido hoy')).toBeNull();
  });

  it('ignora texto vacío', () => {
    expect(detectArchiveIntent('')).toBeNull();
    expect(detectArchiveIntent('   ')).toBeNull();
  });
});

describe('findWorkdayByQuery (con localStorage real via happy-dom)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function seedWorkdays() {
    // Creamos 3 workdays con fechas controladas via vi.useFakeTimers
    vi.useFakeTimers();

    vi.setSystemTime(new Date(2026, 3, 10, 10, 0, 0)); // 10 abril
    saveWorkday([{ role: 'user', content: 'pedido del viernes' }]);

    vi.setSystemTime(new Date(2026, 3, 15, 10, 0, 0)); // 15 abril
    saveWorkday([{ role: 'user', content: 'pedido del miércoles 15' }]);

    vi.setSystemTime(new Date(2026, 3, 17, 10, 0, 0)); // 17 abril
    saveWorkday([{ role: 'user', content: 'pedido del viernes 17' }]);

    vi.useRealTimers();
  }

  it('resuelve "15 de abril"', () => {
    seedWorkdays();
    const wd = findWorkdayByQuery('restaurar chat del 15 de abril');
    expect(wd).not.toBeNull();
    expect(wd?.savedAt.startsWith('2026-04-15')).toBe(true);
  });

  it('resuelve "ayer" como el día más reciente', () => {
    seedWorkdays();
    const wd = findWorkdayByQuery('cargar el chat de ayer');
    expect(wd?.savedAt.startsWith('2026-04-17')).toBe(true);
  });

  it('resuelve "día anterior" como el más reciente', () => {
    seedWorkdays();
    const wd = findWorkdayByQuery('restaurar el dia anterior');
    expect(wd?.savedAt.startsWith('2026-04-17')).toBe(true);
  });

  it('resuelve fecha en formato ISO', () => {
    seedWorkdays();
    const wd = findWorkdayByQuery('restaurar 2026-04-10');
    expect(wd?.savedAt.startsWith('2026-04-10')).toBe(true);
  });

  it('devuelve null si no hay match de fecha', () => {
    seedWorkdays();
    expect(findWorkdayByQuery('restaurar el 99 de febrero')).toBeNull();
  });

  it('devuelve null si el archivo está vacío', () => {
    // No seed
    expect(findWorkdayByQuery('restaurar ayer')).toBeNull();
  });
});

describe('saveWorkday / listWorkdays / getWorkday / deleteWorkday', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('no guarda si la lista de mensajes está vacía', () => {
    expect(saveWorkday([])).toBeNull();
    expect(listWorkdays()).toHaveLength(0);
  });

  it('guarda un chat y lo lista', () => {
    const saved = saveWorkday([
      { role: 'user', content: 'Carlos pidió vaquita talla 38' },
      { role: 'assistant', content: 'Pedido guardado', action: 'create_order', confirmed: true },
    ]);
    expect(saved).not.toBeNull();
    expect(saved?.messageCount).toBe(2);
    expect(saved?.label).toMatch(/de \d{4}$/); // "... de 2026" por ej.

    const list = listWorkdays();
    expect(list).toHaveLength(1);
    expect(list[0].summary).toContain('Carlos pidió vaquita');
  });

  it('recupera un workday específico por id', () => {
    const saved = saveWorkday([{ role: 'user', content: 'prueba' }])!;
    const fetched = getWorkday(saved.id);
    expect(fetched?.id).toBe(saved.id);
    expect(fetched?.messages[0].content).toBe('prueba');
  });

  it('borra un workday sin afectar los demás', () => {
    const a = saveWorkday([{ role: 'user', content: 'primero' }])!;
    saveWorkday([{ role: 'user', content: 'segundo' }])!;
    expect(listWorkdays()).toHaveLength(2);

    deleteWorkday(a.id);
    const remaining = listWorkdays();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).not.toBe(a.id);
  });

  it('filtra mensajes inválidos al guardar', () => {
    // Sólo 2 de estos 4 son válidos
    const saved = saveWorkday([
      { role: 'user', content: 'válido' },
      { role: 'system', content: 'no válido' }, // role inválido
      { role: 'assistant', content: 123 }, // content no-string
      { role: 'assistant', content: 'también válido' },
    ])!;
    expect(saved.messageCount).toBe(2);
  });

  it('ordena por más reciente primero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 10));
    const first = saveWorkday([{ role: 'user', content: 'viejo' }])!;
    vi.setSystemTime(new Date(2026, 3, 17));
    const second = saveWorkday([{ role: 'user', content: 'nuevo' }])!;
    vi.useRealTimers();

    const list = listWorkdays();
    expect(list[0].id).toBe(second.id);
    expect(list[1].id).toBe(first.id);
  });
});
