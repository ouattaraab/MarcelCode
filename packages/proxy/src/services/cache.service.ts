import { createHash } from 'crypto';
import { getRedis, logger } from '../config';
import { Message, ModelId, ChatResponse, CACHE_TTL_SECONDS } from '@marcelia/shared';

function buildCacheKey(type: string, messages: Message[], model: ModelId): string {
  const hash = createHash('sha256')
    .update(JSON.stringify({ type, messages, model }))
    .digest('hex');
  return `cache:${type}:${hash}`;
}

export async function getCachedResponse(
  type: string,
  messages: Message[],
  model: ModelId,
): Promise<ChatResponse | null> {
  try {
    const redis = getRedis();
    const key = buildCacheKey(type, messages, model);
    const cached = await redis.get(key);

    if (cached) {
      logger.debug({ key }, 'Cache hit');
      return JSON.parse(cached);
    }
    return null;
  } catch (err) {
    logger.error({ err }, 'Cache read error');
    return null;
  }
}

export async function setCachedResponse(
  type: string,
  messages: Message[],
  model: ModelId,
  response: ChatResponse,
): Promise<void> {
  try {
    const redis = getRedis();
    const key = buildCacheKey(type, messages, model);
    await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(response));
    logger.debug({ key }, 'Cache set');
  } catch (err) {
    logger.error({ err }, 'Cache write error');
  }
}
