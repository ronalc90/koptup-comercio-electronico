/**
 * Convierte el nombre del negocio en un slug seguro para nombres de archivo.
 * Sin un nombre usable cae a 'export' (genérico, neutral de marca).
 */
function slugifyBusiness(name?: string | null): string {
  if (!name) return 'export'
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'export'
}

/**
 * Descarga un Excel del endpoint /api/export.
 *
 * El nombre del archivo se deriva del negocio (`businessName`) para que no
 * quede atado a una marca concreta; si no se pasa, usa el genérico 'export'.
 * Los llamadores existentes que no pasan `businessName` siguen funcionando.
 */
export async function downloadExcel(
  type: string,
  params?: Record<string, string>,
  businessName?: string | null,
) {
  const query = new URLSearchParams({ type, ...params }).toString()
  const res = await fetch(`/api/export?${query}`)
  if (!res.ok) throw new Error('Error al exportar')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugifyBusiness(businessName)}-${type}-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
