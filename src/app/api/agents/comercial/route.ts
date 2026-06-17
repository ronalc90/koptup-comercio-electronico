import { runAgent } from '@/lib/agents/runAgent';
import { analyzeComercial } from '@/lib/agents/comercial';

export const dynamic = 'force-dynamic';

export async function GET() {
  return runAgent(analyzeComercial);
}
