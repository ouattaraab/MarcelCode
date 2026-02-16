import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create default team
  const defaultTeam = await prisma.team.upsert({
    where: { name: 'Engineering' },
    update: {},
    create: {
      name: 'Engineering',
      description: 'Default engineering team',
    },
  });

  // Create default admin user
  await prisma.user.upsert({
    where: { email: 'admin@eranove.com' },
    update: {},
    create: {
      email: 'admin@eranove.com',
      displayName: 'Admin Marcel\'IA',
      entraObjectId: '00000000-0000-0000-0000-000000000000',
      role: UserRole.admin,
      teamId: defaultTeam.id,
    },
  });

  // Create default quota config for the team
  await prisma.quotaConfig.upsert({
    where: {
      entityType_entityId: {
        entityType: 'team',
        entityId: defaultTeam.id,
      },
    },
    update: {},
    create: {
      entityType: 'team',
      entityId: defaultTeam.id,
      teamId: defaultTeam.id,
      dailyTokenLimit: 500_000,
      monthlyTokenLimit: 10_000_000,
      maxRequestsPerMinute: 20,
      allowedModels: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-opus-4-6'],
    },
  });

  // Create budget alerts
  for (const threshold of [50, 75, 90, 100]) {
    await prisma.budgetAlert.upsert({
      where: {
        entityType_entityId_thresholdPercent: {
          entityType: 'team',
          entityId: defaultTeam.id,
          thresholdPercent: threshold,
        },
      },
      update: {},
      create: {
        entityType: 'team',
        entityId: defaultTeam.id,
        teamId: defaultTeam.id,
        thresholdPercent: threshold,
      },
    });
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
