import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

let prisma: PrismaClient;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasourceUrl: env.DATABASE_URL,
      log:
        env.NODE_ENV === 'development'
          ? [
              { level: 'query', emit: 'event' },
              { level: 'error', emit: 'stdout' },
            ]
          : [{ level: 'error', emit: 'stdout' }],
    });
    logger.info('Prisma client initialized');
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected');
  }
}
