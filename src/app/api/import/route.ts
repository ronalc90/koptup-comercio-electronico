import { NextRequest, NextResponse } from 'next/server';
import { getRequestScopedClient } from '@/lib/tenantServer';
import ExcelJS from 'exceljs';

// Column mappings: Excel header → database field
const ORDER_COLUMNS: Record<string, string> = {
  'CLIENTE': 'client_name',
  'CELULAR': 'phone',
  'CIUDAD': 'city',
  'DIRECCION': 'address',
  'COMPLEMENTO': 'complement',
  'REF': 'product_ref',
  'DETALLE': 'detail',
  'COMENTARIO': 'comment',
  'VALOR A COBRAR': 'value_to_collect',
  'VENDEDOR': 'vendor',
  'DIA PEDIDO': 'order_date',
  'DIA DESPACHO': 'dispatch_date',
  'GUIA': 'guide_number',
  'ESTADO': 'delivery_status',
  'PAGO ANTICIPADO': 'prepaid_amount',
  'GASTOS OP': 'operating_cost',
  'COSTO PRODUCTO': 'product_cost',
  // El nombre nuevo (v1.012) y los alias legacy mapean al mismo campo lógico.
  // En runtime, antes de insertar, este alias se reescribe al nombre real
  // según haya corrido la migración SQL o no.
  'PENDIENTE MENSAJERO': 'payment_courier_pending',
  'EFECTIVO BOGO': 'payment_courier_pending',
  'CAJA': 'payment_cash',
  'TRANSFERENCIA': 'payment_transfer',
  'ES CAMBIO?': 'is_exchange',
  'ID': 'order_code',
};

const INVENTORY_COLUMNS: Record<string, string> = {
  'CANASTA': 'basket_location',
  'ID PRODUCTO': 'product_id',
  'CATEGORÍA': 'category',
  'CATEGORIA': 'category',
  'TIPO': 'type',
  'REFERENCIA': 'reference',
  'MODELO': 'model',
  'COLOR': 'color',
  'TALLA': 'size',
  'CANTIDAD': 'quantity',
  'ESTADO': 'status',
  'OBSERVACIONES': 'observations',
};

const PRODUCT_COLUMNS: Record<string, string> = {
  'ID': 'code',
  'CODIGO': 'code',
  'CÓDIGO': 'code',
  'DETALLE': 'name',
  'NOMBRE': 'name',
  'COSTO': 'cost',
  'CATEGORÍA': 'category',
  'CATEGORIA': 'category',
  'ESTADO': 'active',
};

function cleanCurrency(val: unknown): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseInt(String(val).replace(/[$.,\s]/g, '')) || 0;
}

function cleanString(val: unknown): string {
  if (!val) return '';
  return String(val).trim();
}

/**
 * Parse an Excel date cell into "YYYY-MM-DD" using UTC getters to avoid
 * timezone shifts. Excel stores dates as local-midnight Date objects;
 * toISOString() on a server in a non-UTC TZ shifts them by the offset.
 * Using getUTCFullYear/Month/Date keeps the calendar day stable.
 */
function parseExcelDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;

  if (val instanceof Date) {
    // Excel date-only cells in ExcelJS land as UTC-midnight Date objects.
    // On servers whose TZ is west of UTC, converting back with local getters
    // (or with toISOString on a shifted Date) rolls to the previous/next day.
    // Using UTC getters keeps the calendar day stable across server TZs.
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Excel serial number (days since 1900-01-00)
  if (typeof val === 'number' && Number.isFinite(val)) {
    const base = Date.UTC(1899, 11, 30); // Excel epoch (accounts for 1900 leap bug)
    const ms = base + Math.round(val * 86400000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // String — accept YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
  const s = String(val).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Fallback: let Date parse it and use UTC components
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
  }
  return null;
}

function detectType(headers: string[]): 'orders' | 'inventory' | 'products' | null {
  const upper = headers.map(h => h.toUpperCase().trim());
  if (upper.includes('CLIENTE') && (upper.includes('VALOR A COBRAR') || upper.includes('ESTADO'))) return 'orders';
  if (upper.includes('MODELO') && (upper.includes('CANASTA') || upper.includes('CANTIDAD'))) return 'inventory';
  if (upper.includes('COSTO') && (upper.includes('DETALLE') || upper.includes('NOMBRE'))) return 'products';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    let formData: FormData;
    try { formData = await request.formData(); } catch { return NextResponse.json({ error: 'Envía un archivo Excel como FormData' }, { status: 400 }); }
    const file = formData.get('file') as File;
    const forceType = formData.get('type') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer as ArrayBuffer);

    const scoped = await getRequestScopedClient();
    if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    const supabase = scoped.client;
    // El `tenant_id` lo inyecta el guard del cliente acotado; el `owner` es solo
    // la persona dueña/registradora de la fila. Si el form no lo envía, caemos al
    // usuario autenticado de la sesión (neutral por tenant), no a un nombre fijo.
    const owner = (formData.get('owner') as string) || scoped.ctx.username;
    const results: { type: string; inserted: number; errors: string[] }[] = [];

    for (const sheet of workbook.worksheets) {
      const headerRow = sheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber] = cleanString(cell.value).toUpperCase();
      });

      const type = forceType || detectType(headers);
      if (!type) continue;

      const columnMap = type === 'orders' ? ORDER_COLUMNS : type === 'inventory' ? INVENTORY_COLUMNS : PRODUCT_COLUMNS;

      // Map header positions to db fields
      const fieldMap: Record<number, string> = {};
      headers.forEach((header, colIdx) => {
        const dbField = columnMap[header];
        if (dbField) fieldMap[colIdx] = dbField;
      });

      if (Object.keys(fieldMap).length === 0) continue;

      const rows: Record<string, unknown>[] = [];
      const errors: string[] = [];
      let insertedCount = 0;

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const record: Record<string, unknown> = { owner };
        let hasData = false;

        for (const [colIdx, dbField] of Object.entries(fieldMap)) {
          const cell = row.getCell(parseInt(colIdx));
          const val = cell.value;

          if (val !== null && val !== undefined && val !== '') hasData = true;

          // Type-specific transformations
          if (['value_to_collect', 'payment_courier_pending', 'payment_cash', 'payment_transfer',
               'product_cost', 'operating_cost', 'prepaid_amount', 'cost', 'reference', 'quantity'].includes(dbField)) {
            record[dbField] = cleanCurrency(val);
          } else if (dbField === 'is_exchange') {
            const s = cleanString(val).toLowerCase();
            record[dbField] = s === 'si' || s === 'sí' || s === 'true' || s === '1';
          } else if (dbField === 'active') {
            const s = cleanString(val).toLowerCase();
            record[dbField] = s !== 'inactivo' && s !== 'false' && s !== '0';
          } else if (dbField === 'order_date' || dbField === 'dispatch_date') {
            const parsed = parseExcelDate(val);
            if (parsed) record[dbField] = parsed;
          } else {
            record[dbField] = cleanString(val);
          }
        }

        if (!hasData) return;

        // Defaults
        if (type === 'orders') {
          if (!record.delivery_status) record.delivery_status = 'Confirmado';
          if (!record.order_date) record.order_date = new Date().toISOString().slice(0, 10);
          if (!record.vendor) record.vendor = owner;
          if (!record.client_name) {
            errors.push(`Fila ${rowNumber}: falta nombre del cliente`);
            return;
          }
        }
        if (type === 'inventory') {
          if (!record.status) record.status = 'Bueno';
          // Solo defaultear cuando falta la celda: una cantidad legítima 0
          // (agotado) NO debe convertirse en 1.
          if (record.quantity === undefined || record.quantity === null) record.quantity = 1;
          if (!record.model) {
            errors.push(`Fila ${rowNumber}: falta modelo`);
            return;
          }
        }
        if (type === 'products') {
          // Solo defaultear cuando falta la celda: un producto marcado "Inactivo"
          // ya viene como `false` y NO debe forzarse a `true` (antes era
          // imposible importar un producto inactivo).
          if (record.active === undefined) record.active = true;
          if (!record.code && !record.name) {
            errors.push(`Fila ${rowNumber}: falta código o nombre`);
            return;
          }
        }

        rows.push(record);
      });

      if (rows.length > 0) {
        const table = type === 'orders' ? 'orders' : type === 'inventory' ? 'inventory' : 'products';
        // Si la migración SQL aún no corrió (columna `payment_courier_pending`
        // todavía se llama `payment_cash_bogo`), reescribimos el alias para no
        // fallar el insert.
        if (table === 'orders') {
          const { error: probe } = await supabase.from('orders').select('payment_courier_pending').limit(1);
          if (probe) {
            for (const r of rows) {
              if ('payment_courier_pending' in r) {
                r.payment_cash_bogo = r.payment_courier_pending;
                delete r.payment_courier_pending;
              }
            }
          }
        }
        // Insert in batches of 50. Contamos las filas REALMENTE insertadas
        // (antes se restaba 1 por mensaje de error, no las filas del lote
        // fallido, inflando el total reportado).
        for (let i = 0; i < rows.length; i += 50) {
          const batch = rows.slice(i, i + 50);
          const { error } = await supabase.from(table).insert(batch);
          if (error) {
            errors.push(`Error BD en lote ${Math.floor(i/50)+1}: ${error.message}`);
          } else {
            insertedCount += batch.length;
          }
        }
      }

      results.push({
        type: type,
        inserted: insertedCount,
        errors,
      });
    }

    if (results.length === 0) {
      return NextResponse.json({
        error: 'No se reconoció el formato del Excel. Asegúrate de que las columnas coincidan con el formato de exportación.',
      }, { status: 400 });
    }

    return NextResponse.json({ results });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error procesando archivo';
    console.error('Import error:', msg);
    return NextResponse.json({ error: 'No se pudo procesar el archivo' }, { status: 500 });
  }
}
