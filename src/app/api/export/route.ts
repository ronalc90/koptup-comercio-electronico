import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getRequestScopedClient } from '@/lib/tenantServer'
import { loadTenantConfig } from '@/lib/tenantConfigServer'
import { isOwnerSupported } from '@/lib/db'

/**
 * Convierte el nombre del negocio en un slug seguro para nombres de archivo
 * (minúsculas, sin acentos ni símbolos). Si no queda nada usable, cae a
 * 'export' para que el archivo siempre tenga un prefijo válido.
 */
function slugifyName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'export'
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E3A5F' },
}

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 10,
}

const MONEY_FORMAT = '"$ "#,##0.00'

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1)
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    }
  })
  header.height = 28
}

function addBorders(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, idx) => {
    if (idx === 1) return
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      }
      // Alternate row shading
      if (idx % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } }
      }
    })
  })
}

/** Build "Nacionales" sheet — format matching Abril2026.xlsx Nacionales */
function buildNacionalesSheet(
  workbook: ExcelJS.Workbook,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orders: any[],
) {
  const sheet = workbook.addWorksheet('Nacionales')
  sheet.columns = [
    { header: 'CLIENTE', key: 'cliente', width: 22 },
    { header: 'CELULAR', key: 'celular', width: 14 },
    { header: 'CIUDAD', key: 'ciudad', width: 14 },
    { header: 'DIRECCION', key: 'direccion', width: 28 },
    { header: 'COMPLEMENTO', key: 'complemento', width: 28 },
    { header: 'REF', key: 'ref', width: 12 },
    { header: 'DETALLE', key: 'detalle', width: 35 },
    { header: 'COMENTARIO', key: 'comentario', width: 25 },
    { header: 'VALOR A COBRAR', key: 'valor_cobrar', width: 18 },
    { header: 'VENDEDOR', key: 'vendedor', width: 14 },
    { header: 'DIA PEDIDO', key: 'dia_pedido', width: 14 },
    { header: 'DIA DESPACHO', key: 'dia_despacho', width: 14 },
    { header: 'GUIA', key: 'guia', width: 14 },
    { header: 'ESTADO', key: 'estado', width: 20 },
    { header: 'PAGO ANTICIPADO', key: 'pago_anticipado', width: 16 },
    { header: 'GASTOS OP', key: 'gastos_op', width: 14 },
    { header: 'COSTO PRODUCTO', key: 'costo', width: 16 },
    { header: 'UTILIDAD', key: 'utilidad', width: 16 },
  ]
  styleHeader(sheet)

  orders.forEach((o) => {
    const utilidad = (o.value_to_collect ?? 0) - (o.product_cost ?? 0) - (o.operating_cost ?? 0)
    const row = sheet.addRow({
      cliente: o.client_name,
      celular: o.phone,
      ciudad: o.city ?? '',
      direccion: o.address,
      complemento: o.complement,
      ref: o.product_ref,
      detalle: o.detail,
      comentario: o.comment,
      valor_cobrar: o.value_to_collect ?? 0,
      vendedor: o.vendor ?? '',
      dia_pedido: o.order_date ?? '',
      dia_despacho: o.dispatch_date ?? '',
      guia: o.guide_number ?? '',
      estado: o.delivery_status,
      pago_anticipado: o.prepaid_amount ?? 0,
      gastos_op: o.operating_cost ?? 0,
      costo: o.product_cost ?? 0,
      utilidad,
    })
    ;['valor_cobrar', 'pago_anticipado', 'gastos_op', 'costo', 'utilidad'].forEach((key) => {
      row.getCell(key).numFmt = MONEY_FORMAT
    })
  })

  addBorders(sheet)
  return sheet
}

/** Build daily sheet — format matching Abril2026.xlsx sheet "1", "2", etc. */
function buildDailySheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orders: any[],
) {
  const sheet = workbook.addWorksheet(sheetName)
  sheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'CLIENTE', key: 'cliente', width: 22 },
    { header: 'CELULAR', key: 'celular', width: 14 },
    { header: 'DIRECCION', key: 'direccion', width: 28 },
    { header: 'COMPLEMENTO', key: 'complemento', width: 28 },
    { header: 'REF', key: 'ref', width: 12 },
    { header: 'DETALLE', key: 'detalle', width: 35 },
    { header: 'COMENTARIO', key: 'comentario', width: 25 },
    { header: 'VALOR A COBRAR', key: 'valor_cobrar', width: 18 },
    { header: 'PENDIENTE MENSAJERO', key: 'courier_pending', width: 22 },
    { header: 'CAJA', key: 'caja', width: 14 },
    { header: 'TRANSFERENCIA', key: 'transferencia', width: 16 },
    { header: 'COSTO PRODUCTO', key: 'costo', width: 16 },
    { header: 'ENTREGA', key: 'entrega', width: 14 },
    { header: 'VENDEDOR', key: 'vendedor', width: 14 },
    { header: 'ESTADO', key: 'estado', width: 18 },
    { header: 'COMPLEMENTO ESTADO', key: 'comp_estado', width: 20 },
    { header: 'ES CAMBIO?', key: 'es_cambio', width: 12 },
  ]
  styleHeader(sheet)

  orders.forEach((o) => {
    const row = sheet.addRow({
      id: o.order_code,
      cliente: o.client_name,
      celular: o.phone,
      direccion: o.address,
      complemento: o.complement,
      ref: o.product_ref,
      detalle: o.detail,
      comentario: o.comment,
      valor_cobrar: o.value_to_collect ?? 0,
      courier_pending: (o.payment_courier_pending ?? o.payment_cash_bogo) ?? 0,
      caja: o.payment_cash ?? 0,
      transferencia: o.payment_transfer ?? 0,
      costo: o.product_cost ?? 0,
      entrega: o.delivery_type ?? '',
      vendedor: o.vendor ?? '',
      estado: o.delivery_status,
      comp_estado: o.status_complement ?? '',
      es_cambio: o.is_exchange ? 'Si' : 'No',
    })
    ;['valor_cobrar', 'courier_pending', 'caja', 'transferencia', 'costo'].forEach((key) => {
      row.getCell(key).numFmt = MONEY_FORMAT
    })
  })

  addBorders(sheet)
  return sheet
}

/** Build "Global" monthly summary sheet matching Abril2026 format */
function buildGlobalSheet(
  workbook: ExcelJS.Workbook,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orders: any[],
  year: number,
  month: number,
) {
  const sheet = workbook.addWorksheet('Global')

  // Title row
  const titleRow = sheet.addRow(['Mes', month, '', 'Año', year])
  titleRow.getCell(1).font = { bold: true, size: 12 }
  titleRow.getCell(4).font = { bold: true, size: 12 }
  sheet.addRow([]) // blank row

  // Header row
  sheet.addRow([
    'Dia',
    '# Pedidos Total',
    '# Entrega Mensajería',
    '# Recogida en tienda',
    '# Otro tipo de envío',
    '# Devoluciones',
    '# Cambios',
    '# Cancelados',
    'Pendiente del mensajero',
    'Recaudo en caja',
    'Transferencias',
    'Total Recaudo',
    'Total Costos',
    'Total Gastos Op',
    'Utilidad',
  ])
  const headerRow = sheet.getRow(3)
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  })
  headerRow.height = 32

  const daysInMonth = new Date(year, month, 0).getDate()

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayOrders = orders.filter((o) => o.order_date === dateStr)
    const delivered = dayOrders.filter((o) => o.delivery_status === 'Entregado')
    // Acepta valores legacy + canónicos v1.012
    const courier = delivered.filter((o) => o.delivery_type === 'Mensajeria' || o.delivery_type === 'Bogo')
    const pickup = delivered.filter((o) => o.delivery_type === 'Recogida' || o.delivery_type === 'Bodega')
    const other = delivered.filter((o) => o.delivery_type === 'Otro' || o.delivery_type === 'Otros' || (!o.delivery_type && o.delivery_status === 'Entregado'))
    const devol = dayOrders.filter((o) => o.delivery_status === 'Devolucion')
    const cambios = dayOrders.filter((o) => o.is_exchange)
    const cancelled = dayOrders.filter((o) => o.delivery_status === 'Cancelado')

    const active = dayOrders.filter((o) => o.delivery_status === 'Confirmado' || o.delivery_status === 'Entregado')
    const courierPending = active.reduce((s: number, o) => s + ((o.payment_courier_pending ?? o.payment_cash_bogo) ?? 0), 0)
    const recaudoCaja = active.reduce((s: number, o) => s + (o.payment_cash ?? 0), 0)
    const recaudoTrans = active.reduce((s: number, o) => s + (o.payment_transfer ?? 0), 0)
    const totalRecaudo = active.reduce((s: number, o) => s + (o.value_to_collect ?? 0), 0)
    const totalCostos = active.reduce((s: number, o) => s + (o.product_cost ?? 0), 0)
    const totalGastos = active.reduce((s: number, o) => s + (o.operating_cost ?? 0), 0)
    const utilidad = totalRecaudo - totalCostos - totalGastos

    const row = sheet.addRow([
      d,
      dayOrders.length,
      courier.length,
      pickup.length,
      other.length,
      devol.length,
      cambios.length,
      cancelled.length,
      courierPending,
      recaudoCaja,
      recaudoTrans,
      totalRecaudo,
      totalCostos,
      totalGastos,
      utilidad,
    ])

    // Format money columns (9-15)
    for (let c = 9; c <= 15; c++) {
      row.getCell(c).numFmt = MONEY_FORMAT
    }
  }

  // Auto width
  sheet.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 6 : 18
  })

  addBorders(sheet)
  return sheet
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? ''
  const month = searchParams.get('month')
  const year = searchParams.get('year')
  const date = searchParams.get('date')
  const owner = searchParams.get('owner')

  const scoped = await getRequestScopedClient()
  if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const supabase = scoped.client
  // Marca por tenant: el nombre real del negocio (no la marca de la plataforma).
  const tenantConfig = await loadTenantConfig(scoped.ctx.tenantId, scoped.ctx.tenantSlug)
  const businessName = tenantConfig.name
  const fileSlug = slugifyName(businessName)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = businessName
  workbook.created = new Date()
  const hasOwner = await isOwnerSupported()

  try {
    if (type === 'dashboard') {
      if (!month || !year) {
        return NextResponse.json({ error: 'Se requieren month y year' }, { status: 400 })
      }
      const m = parseInt(month, 10)
      const y = parseInt(year, 10)
      const from = `${y}-${String(m).padStart(2, '0')}-01`
      const daysInMonth = new Date(y, m, 0).getDate()
      const to = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

      let ordersQuery = supabase.from('orders').select('*')
      if (hasOwner) ordersQuery = ordersQuery.eq('owner', owner)
      ordersQuery = ordersQuery.gte('order_date', from).lte('order_date', to).order('order_date', { ascending: true })
      const { data: orders, error } = await ordersQuery
      if (error) throw error

      const rows = orders ?? []

      // Sheet 1: Nacionales (all orders — same format as Abril2026)
      buildNacionalesSheet(workbook, rows)

      // Sheet 2: Global (daily summary)
      buildGlobalSheet(workbook, rows, y, m)

      // Sheet 3: Costos (product costs reference)
      let productsQuery = supabase.from('products').select('*')
      if (hasOwner) productsQuery = productsQuery.eq('owner', owner)
      const { data: products } = await productsQuery.order('code')

      const costosSheet = workbook.addWorksheet('Costos')
      costosSheet.columns = [
        { header: 'ID', key: 'id', width: 12 },
        { header: 'DETALLE', key: 'detalle', width: 40 },
        { header: 'COSTO', key: 'costo', width: 18 },
      ]
      styleHeader(costosSheet)
      ;(products ?? []).forEach((p) => {
        const row = costosSheet.addRow({
          id: p.code,
          detalle: p.name,
          costo: p.cost ?? 0,
        })
        row.getCell('costo').numFmt = MONEY_FORMAT
      })
      addBorders(costosSheet)
    } else if (type === 'orders-daily') {
      if (!date) {
        return NextResponse.json({ error: 'Se requiere date' }, { status: 400 })
      }

      let ordersQuery = supabase.from('orders').select('*')
      if (hasOwner) ordersQuery = ordersQuery.eq('owner', owner)
      ordersQuery = ordersQuery.eq('order_date', date).order('created_at', { ascending: true })
      const { data: orders, error } = await ordersQuery
      if (error) throw error

      buildDailySheet(workbook, `Pedidos ${date}`, orders ?? [])
    } else if (type === 'inventory') {
      let inventoryQuery = supabase.from('inventory').select('*')
      if (hasOwner) inventoryQuery = inventoryQuery.eq('owner', owner)
      inventoryQuery = inventoryQuery.order('created_at', { ascending: true })
      const { data: items, error } = await inventoryQuery
      if (error) throw error

      const sheet = workbook.addWorksheet('Inventario')
      sheet.columns = [
        { header: 'CANASTA', key: 'basket_location', width: 12 },
        { header: 'ID PRODUCTO', key: 'product_id', width: 14 },
        { header: 'CATEGORÍA', key: 'category', width: 14 },
        { header: 'TIPO', key: 'type', width: 10 },
        { header: 'REFERENCIA', key: 'reference', width: 12 },
        { header: 'MODELO', key: 'model', width: 30 },
        { header: 'COLOR', key: 'color', width: 16 },
        { header: 'TALLA', key: 'size', width: 10 },
        { header: 'CANTIDAD', key: 'quantity', width: 12 },
        { header: 'ESTADO', key: 'status', width: 12 },
      ]
      styleHeader(sheet)
      ;(items ?? []).forEach((i) => {
        sheet.addRow({
          basket_location: i.basket_location,
          product_id: i.product_id,
          category: i.category,
          type: i.type,
          reference: i.reference,
          model: i.model,
          color: i.color,
          size: i.size,
          quantity: i.quantity,
          status: i.status,
        })
      })
      addBorders(sheet)
    } else if (type === 'products') {
      let productsQuery = supabase.from('products').select('*')
      if (hasOwner) productsQuery = productsQuery.eq('owner', owner)
      productsQuery = productsQuery.order('created_at', { ascending: true })
      const { data: products, error } = await productsQuery
      if (error) throw error

      const sheet = workbook.addWorksheet('Productos')
      sheet.columns = [
        { header: 'ID', key: 'code', width: 14 },
        { header: 'DETALLE', key: 'name', width: 40 },
        { header: 'COSTO', key: 'cost', width: 18 },
        { header: 'CATEGORÍA', key: 'category', width: 14 },
        { header: 'ESTADO', key: 'active', width: 12 },
      ]
      styleHeader(sheet)
      ;(products ?? []).forEach((p) => {
        const row = sheet.addRow({
          code: p.code,
          name: p.name,
          cost: p.cost,
          category: p.category,
          active: p.active ? 'Activo' : 'Inactivo',
        })
        row.getCell('cost').numFmt = MONEY_FORMAT
      })
      addBorders(sheet)
    } else {
      return NextResponse.json({ error: 'Tipo de exportación no válido' }, { status: 400 })
    }

    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileSlug}-${type}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  } catch (err) {
    console.error('[export]', err)
    return NextResponse.json({ error: 'Error al generar el archivo' }, { status: 500 })
  }
}
