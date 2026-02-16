import { getPrisma } from '../config';

export interface UsageAggregation {
  period: string;
  totalRequests: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgLatencyMs: number;
  cachedRequests: number;
  byModel: Record<string, { requests: number; tokens: number }>;
}

export async function getUsageByTeam(
  teamId: string,
  startDate: Date,
  endDate: Date,
): Promise<UsageAggregation> {
  const prisma = getPrisma();

  const logs = await prisma.usageLog.findMany({
    where: {
      user: { teamId },
      createdAt: { gte: startDate, lte: endDate },
    },
    select: {
      model: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      latencyMs: true,
      cached: true,
    },
  });

  const byModel: Record<string, { requests: number; tokens: number }> = {};
  let totalLatency = 0;
  let cachedCount = 0;

  for (const log of logs) {
    if (!byModel[log.model]) {
      byModel[log.model] = { requests: 0, tokens: 0 };
    }
    byModel[log.model].requests++;
    byModel[log.model].tokens += log.totalTokens;
    totalLatency += log.latencyMs;
    if (log.cached) cachedCount++;
  }

  return {
    period: `${startDate.toISOString()} - ${endDate.toISOString()}`,
    totalRequests: logs.length,
    totalTokens: logs.reduce((s, l) => s + l.totalTokens, 0),
    totalInputTokens: logs.reduce((s, l) => s + l.inputTokens, 0),
    totalOutputTokens: logs.reduce((s, l) => s + l.outputTokens, 0),
    avgLatencyMs: logs.length > 0 ? Math.round(totalLatency / logs.length) : 0,
    cachedRequests: cachedCount,
    byModel,
  };
}

export async function getUsageByUser(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<UsageAggregation> {
  const prisma = getPrisma();

  const logs = await prisma.usageLog.findMany({
    where: {
      userId,
      createdAt: { gte: startDate, lte: endDate },
    },
    select: {
      model: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      latencyMs: true,
      cached: true,
    },
  });

  const byModel: Record<string, { requests: number; tokens: number }> = {};
  let totalLatency = 0;
  let cachedCount = 0;

  for (const log of logs) {
    if (!byModel[log.model]) {
      byModel[log.model] = { requests: 0, tokens: 0 };
    }
    byModel[log.model].requests++;
    byModel[log.model].tokens += log.totalTokens;
    totalLatency += log.latencyMs;
    if (log.cached) cachedCount++;
  }

  return {
    period: `${startDate.toISOString()} - ${endDate.toISOString()}`,
    totalRequests: logs.length,
    totalTokens: logs.reduce((s, l) => s + l.totalTokens, 0),
    totalInputTokens: logs.reduce((s, l) => s + l.inputTokens, 0),
    totalOutputTokens: logs.reduce((s, l) => s + l.outputTokens, 0),
    avgLatencyMs: logs.length > 0 ? Math.round(totalLatency / logs.length) : 0,
    cachedRequests: cachedCount,
    byModel,
  };
}

export async function getTopUsers(
  teamId: string,
  startDate: Date,
  endDate: Date,
  limit = 10,
) {
  const prisma = getPrisma();

  const users = await prisma.usageLog.groupBy({
    by: ['userId'],
    where: {
      user: { teamId },
      createdAt: { gte: startDate, lte: endDate },
    },
    _sum: { totalTokens: true },
    _count: true,
    orderBy: { _sum: { totalTokens: 'desc' } },
    take: limit,
  });

  return users.map((u) => ({
    userId: u.userId,
    totalTokens: u._sum.totalTokens || 0,
    requestCount: u._count,
  }));
}
