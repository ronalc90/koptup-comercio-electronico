import { runAgent } from '@/lib/agents/runAgent';
import { analyzeAuditor } from '@/lib/agents/auditor';

export const dynamic = 'force-dynamic';

export async function GET() {
  return runAgent(analyzeAuditor);
}
