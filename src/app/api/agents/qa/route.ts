import { runAgent } from '@/lib/agents/runAgent';
import { analyzeQa } from '@/lib/agents/qa';

export const dynamic = 'force-dynamic';

export async function GET() {
  return runAgent(analyzeQa);
}
