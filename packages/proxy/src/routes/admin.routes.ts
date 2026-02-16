import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { getPrisma, logger } from '../config';
import { UserRole } from '@marcelia/shared';
import { getQuotaStatus } from '../services/quota.service';
import { getUsageByTeam, getUsageByUser, getTopUsers } from '../services/analytics.service';

export const adminRoutes = Router();

// All admin routes require admin role
adminRoutes.use(requireRole(UserRole.ADMIN));

// --- Teams ---
adminRoutes.get('/teams', async (_req: Request, res: Response) => {
  const prisma = getPrisma();
  const teams = await prisma.team.findMany({
    include: { _count: { select: { users: true } } },
  });
  res.json(teams);
});

adminRoutes.post('/teams', async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const team = await prisma.team.create({
    data: { name: req.body.name, description: req.body.description },
  });
  res.status(201).json(team);
});

adminRoutes.put('/teams/:id', async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const id = req.params.id as string;
  const team = await prisma.team.update({
    where: { id },
    data: { name: req.body.name, description: req.body.description },
  });
  res.json(team);
});

// --- Users ---
adminRoutes.get('/users', async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const teamId = req.query.teamId as string | undefined;
  const users = await prisma.user.findMany({
    where: teamId ? { teamId } : undefined,
    include: { team: true },
  });
  res.json(users);
});

adminRoutes.put('/users/:id', async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const id = req.params.id as string;
  const user = await prisma.user.update({
    where: { id },
    data: {
      role: req.body.role,
      teamId: req.body.teamId,
    },
  });
  res.json(user);
});

// --- Quotas ---
adminRoutes.get('/quotas/:entityType/:entityId', async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const entityType = req.params.entityType as string;
  const entityId = req.params.entityId as string;
  const config = await prisma.quotaConfig.findUnique({
    where: {
      entityType_entityId: { entityType, entityId },
    },
  });
  if (!config) {
    res.status(404).json({ error: 'Quota config not found' });
    return;
  }
  res.json(config);
});

adminRoutes.put('/quotas/:entityType/:entityId', async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const entityType = req.params.entityType as string;
  const entityId = req.params.entityId as string;
  const config = await prisma.quotaConfig.upsert({
    where: {
      entityType_entityId: { entityType, entityId },
    },
    update: {
      dailyTokenLimit: req.body.dailyTokenLimit,
      monthlyTokenLimit: req.body.monthlyTokenLimit,
      maxRequestsPerMinute: req.body.maxRequestsPerMinute,
      allowedModels: req.body.allowedModels,
    },
    create: {
      entityType,
      entityId,
      dailyTokenLimit: req.body.dailyTokenLimit,
      monthlyTokenLimit: req.body.monthlyTokenLimit,
      maxRequestsPerMinute: req.body.maxRequestsPerMinute,
      allowedModels: req.body.allowedModels,
    },
  });
  res.json(config);
});

// --- Analytics ---
adminRoutes.get('/analytics/team/:teamId', async (req: Request, res: Response) => {
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
  const end = endDate ? new Date(endDate) : new Date();
  const teamId = req.params.teamId as string;

  const analytics = await getUsageByTeam(teamId, start, end);
  res.json(analytics);
});

adminRoutes.get('/analytics/user/:userId', async (req: Request, res: Response) => {
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
  const end = endDate ? new Date(endDate) : new Date();
  const userId = req.params.userId as string;

  const analytics = await getUsageByUser(userId, start, end);
  res.json(analytics);
});

adminRoutes.get('/analytics/top-users/:teamId', async (req: Request, res: Response) => {
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const limit = req.query.limit as string | undefined;
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
  const end = endDate ? new Date(endDate) : new Date();
  const teamId = req.params.teamId as string;

  const topUsers = await getTopUsers(teamId, start, end, Number(limit) || 10);
  res.json(topUsers);
});

// --- Quota Status ---
adminRoutes.get('/quota-status/:userId', async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const userId = req.params.userId as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const status = await getQuotaStatus(user.id, user.teamId);
  res.json(status);
});
