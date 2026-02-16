import { Request, Response, NextFunction } from 'express';
import { getPrisma, logger } from '../config';
import { AuthenticatedUser } from '@marcelia/shared';

export async function quotaGuard(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthenticatedUser;
  if (!user) return next();

  try {
    const prisma = getPrisma();

    // Get quota config for user's team or default
    const quotaConfig = await prisma.quotaConfig.findFirst({
      where: user.teamId
        ? {
            OR: [
              { entityType: 'user', entityId: user.id },
              { entityType: 'team', entityId: user.teamId },
            ],
          }
        : { entityType: 'user', entityId: user.id },
      orderBy: { entityType: 'asc' }, // user-specific takes priority
    });

    if (!quotaConfig) {
      // No quota config = use defaults, allow request
      return next();
    }

    // Check daily usage
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const dailyUsage = await prisma.usageLog.aggregate({
      where: {
        userId: user.id,
        createdAt: { gte: todayStart },
      },
      _sum: { totalTokens: true },
    });

    const tokensUsedToday = dailyUsage._sum.totalTokens || 0;

    if (tokensUsedToday >= quotaConfig.dailyTokenLimit) {
      logger.warn({ userId: user.id, tokensUsedToday }, 'Daily quota exceeded');
      res.status(429).json({
        error: 'Daily token quota exceeded. Your quota resets at midnight UTC.',
        code: 'QUOTA_EXCEEDED',
        statusCode: 429,
        quota: {
          tokensUsed: tokensUsedToday,
          tokensLimit: quotaConfig.dailyTokenLimit,
          period: 'daily',
        },
      });
      return;
    }

    // Check monthly usage
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthlyUsage = await prisma.usageLog.aggregate({
      where: {
        userId: user.id,
        createdAt: { gte: monthStart },
      },
      _sum: { totalTokens: true },
    });

    const tokensUsedMonth = monthlyUsage._sum.totalTokens || 0;

    if (tokensUsedMonth >= quotaConfig.monthlyTokenLimit) {
      logger.warn({ userId: user.id, tokensUsedMonth }, 'Monthly quota exceeded');
      res.status(429).json({
        error: 'Monthly token quota exceeded. Your quota resets at the start of next month.',
        code: 'QUOTA_EXCEEDED',
        statusCode: 429,
        quota: {
          tokensUsed: tokensUsedMonth,
          tokensLimit: quotaConfig.monthlyTokenLimit,
          period: 'monthly',
        },
      });
      return;
    }

    // Attach quota info to request
    (req as any).quotaRemaining = {
      daily: quotaConfig.dailyTokenLimit - tokensUsedToday,
      monthly: quotaConfig.monthlyTokenLimit - tokensUsedMonth,
    };

    next();
  } catch (err) {
    logger.error({ err }, 'Quota guard error, allowing request');
    next();
  }
}
