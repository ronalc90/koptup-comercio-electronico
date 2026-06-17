import { runAgent } from '@/lib/agents/runAgent';
import { analyzeInventario } from '@/lib/agents/inventario';

export const dynamic = 'force-dynamic';

export async function GET() {
  return runAgent(analyzeInventario);
}
