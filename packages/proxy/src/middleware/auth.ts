import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import { env, logger, getPrisma } from '../config';
import { AuthenticatedUser, UserRole } from '@marcelia/shared';

let jwks: jose.JWTVerifyGetKey;

function getJwks() {
  if (!jwks) {
    const jwksUrl = `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/discovery/v2.0/keys`;
    jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwks;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Dev-mode bypass: use seeded admin user when no token is provided
  // REQUIRE_AUTH=true forces auth even in dev mode
  if (env.NODE_ENV === 'development' && !env.REQUIRE_AUTH && !req.headers.authorization) {
    const prisma = getPrisma();
    const devUser = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (devUser) {
      (req as any).user = {
        id: devUser.id,
        email: devUser.email,
        displayName: devUser.displayName,
        role: devUser.role as UserRole,
        teamId: devUser.teamId,
        entraObjectId: devUser.entraObjectId,
      } satisfies AuthenticatedUser;
      logger.debug({ userId: devUser.id }, 'Dev-mode auth bypass');
      return next();
    }
  }

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Missing or invalid authorization header',
      code: 'AUTH_MISSING',
      statusCode: 401,
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jose.jwtVerify(token, getJwks(), {
      issuer: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/v2.0`,
      audience: env.AZURE_AUDIENCE,
    });

    const oid = payload.oid as string;
    const email = (payload.preferred_username || payload.email) as string;
    const displayName = (payload.name || email) as string;

    // Auto-provision user on first login
    const prisma = getPrisma();
    const user = await prisma.user.upsert({
      where: { entraObjectId: oid },
      update: { email, displayName },
      create: {
        entraObjectId: oid,
        email,
        displayName,
        role: 'developer',
      },
    });

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role as UserRole,
      teamId: user.teamId,
      entraObjectId: user.entraObjectId,
    };

    (req as any).user = authenticatedUser;
    next();
  } catch (err) {
    logger.warn({ err }, 'JWT validation failed');
    res.status(401).json({
      error: 'Invalid or expired token',
      code: 'AUTH_INVALID',
      statusCode: 401,
    });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthenticatedUser;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        statusCode: 403,
      });
      return;
    }
    next();
  };
}
