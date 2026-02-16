import { getPrisma, logger } from '../config';

interface UsageRecord {
  userId: string;
  requestType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  cached: boolean;
  requestId: string;
}

export async function trackUsage(record: UsageRecord): Promise<void> {
  try {
    const prisma = getPrisma();
    await prisma.usageLog.create({
      data: {
        userId: record.userId,
        requestType: record.requestType,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        totalTokens: record.totalTokens,
        latencyMs: record.latencyMs,
        cached: record.cached,
        requestId: record.requestId,
      },
    });
  } catch (err) {
    logger.error({ err, record }, 'Failed to track usage');
  }
}
