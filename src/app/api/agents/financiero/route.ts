import { runAgent } from '@/lib/agents/runAgent';
import { analyzeFinanciero } from '@/lib/agents/financiero';

export const dynamic = 'force-dynamic';

export async function GET() {
  return runAgent(analyzeFinanciero);
}
