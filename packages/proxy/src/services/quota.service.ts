import { getPrisma, logger } from '../config';
import { QuotaStatus } from '@marcelia/shared';

export async function getQuotaStatus(userId: string, teamId: string | null): Promise<QuotaStatus> {
  const prisma = getPrisma();

  const quotaConfig = await prisma.quotaConfig.findFirst({
    where: teamId
      ? {
          OR: [
            { entityType: 'user', entityId: userId },
            { entityType: 'team', entityId: teamId },
          ],
        }
      : { entityType: 'user', entityId: userId },
    orderBy: { entityType: 'asc' },
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const dailyUsage = await prisma.usageLog.aggregate({
    where: {
      userId,
      createdAt: { gte: todayStart },
    },
    _sum: { totalTokens: true },
  });

  const tokensUsed = dailyUsage._sum.totalTokens || 0;
  const tokensLimit = quotaConfig?.dailyTokenLimit || 500_000;
  const tokensRemaining = Math.max(0, tokensLimit - tokensUsed);

  return {
    userId,
    teamId,
    period: 'daily',
    tokensUsed,
    tokensLimit,
    tokensRemaining,
    percentUsed: Math.round((tokensUsed / tokensLimit) * 100),
    resetAt: tomorrowStart,
  };
}

export async function checkBudgetAlerts(userId: string, teamId: string | null): Promise<void> {
  try {
    const status = await getQuotaStatus(userId, teamId);
    const prisma = getPrisma();

    const entityId = teamId || userId;
    const entityType = teamId ? 'team' : 'user';

    const alerts = await prisma.budgetAlert.findMany({
      where: {
        entityType,
        entityId,
        notified: false,
        thresholdPercent: { lte: status.percentUsed },
      },
    });

    for (const alert of alerts) {
      await prisma.budgetAlert.update({
        where: { id: alert.id },
        data: { notified: true, notifiedAt: new Date() },
      });
      logger.warn(
        { entityType, entityId, threshold: alert.thresholdPercent, percentUsed: status.percentUsed },
        `Budget alert: ${alert.thresholdPercent}% threshold reached`,
      );
    }
  } catch (err) {
    logger.error({ err }, 'Budget alert check failed');
  }
}
