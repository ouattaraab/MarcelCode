import { Request, Response, NextFunction } from 'express';
import { getRedis, env, logger } from '../config';
import { AuthenticatedUser } from '@marcelia/shared';

export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthenticatedUser;
  if (!user) return next();

  const redis = getRedis();
  const key = `rate:${user.id}`;
  const windowMs = env.RATE_LIMIT_WINDOW_SECONDS * 1000;
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // Sliding window using sorted set
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
    pipeline.zcard(key);
    pipeline.pexpire(key, windowMs);
    const results = await pipeline.exec();

    const requestCount = results?.[2]?.[1] as number;

    res.setHeader('X-RateLimit-Limit', env.RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, env.RATE_LIMIT_MAX - requestCount));
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));

    if (requestCount > env.RATE_LIMIT_MAX) {
      logger.warn({ userId: user.id, requestCount }, 'Rate limit exceeded');
      res.status(429).json({
        error: `Rate limit exceeded. Maximum ${env.RATE_LIMIT_MAX} requests per ${env.RATE_LIMIT_WINDOW_SECONDS} seconds.`,
        code: 'RATE_LIMITED',
        statusCode: 429,
        retryAfter: env.RATE_LIMIT_WINDOW_SECONDS,
      });
      return;
    }

    next();
  } catch (err) {
    logger.error({ err }, 'Rate limiter error, allowing request');
    next();
  }
}
