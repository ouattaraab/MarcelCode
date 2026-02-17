import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

// Budget tiers in USD — converted to approximate token limits
// Haiku ~$0.8/$4 per 1M tokens, Sonnet ~$3/$15, average ~$5/1M tokens
// $20 budget ≈ 4M tokens/month, $200 budget ≈ 40M tokens/month
const BUDGET_TIERS = {
  standard: {
    name: 'Standard ($20)',
    dailyTokenLimit: 200_000,      // ~$1/day
    monthlyTokenLimit: 4_000_000,  // ~$20/month
  },
  premium: {
    name: 'Premium ($200)',
    dailyTokenLimit: 2_000_000,    // ~$10/day
    monthlyTokenLimit: 40_000_000, // ~$200/month
  },
};

async function main() {
  // Create teams for budget tiers
  const standardTeam = await prisma.team.upsert({
    where: { name: 'Standard' },
    update: { description: BUDGET_TIERS.standard.name },
    create: {
      name: 'Standard',
      description: BUDGET_TIERS.standard.name,
    },
  });

  const premiumTeam = await prisma.team.upsert({
    where: { name: 'Premium' },
    update: { description: BUDGET_TIERS.premium.name },
    create: {
      name: 'Premium',
      description: BUDGET_TIERS.premium.name,
    },
  });

  // Keep legacy Engineering team
  const engineeringTeam = await prisma.team.upsert({
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
      teamId: premiumTeam.id,
    },
  });

  // Quota config: Standard tier ($20/month)
  await prisma.quotaConfig.upsert({
    where: {
      entityType_entityId: { entityType: 'team', entityId: standardTeam.id },
    },
    update: {
      dailyTokenLimit: BUDGET_TIERS.standard.dailyTokenLimit,
      monthlyTokenLimit: BUDGET_TIERS.standard.monthlyTokenLimit,
    },
    create: {
      entityType: 'team',
      entityId: standardTeam.id,
      teamId: standardTeam.id,
      dailyTokenLimit: BUDGET_TIERS.standard.dailyTokenLimit,
      monthlyTokenLimit: BUDGET_TIERS.standard.monthlyTokenLimit,
      maxRequestsPerMinute: 20,
      allowedModels: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929'],
    },
  });

  // Quota config: Premium tier ($200/month)
  await prisma.quotaConfig.upsert({
    where: {
      entityType_entityId: { entityType: 'team', entityId: premiumTeam.id },
    },
    update: {
      dailyTokenLimit: BUDGET_TIERS.premium.dailyTokenLimit,
      monthlyTokenLimit: BUDGET_TIERS.premium.monthlyTokenLimit,
    },
    create: {
      entityType: 'team',
      entityId: premiumTeam.id,
      teamId: premiumTeam.id,
      dailyTokenLimit: BUDGET_TIERS.premium.dailyTokenLimit,
      monthlyTokenLimit: BUDGET_TIERS.premium.monthlyTokenLimit,
      maxRequestsPerMinute: 40,
      allowedModels: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-opus-4-6'],
    },
  });

  // Budget alerts for both tiers
  for (const team of [standardTeam, premiumTeam]) {
    for (const threshold of [50, 75, 90, 100]) {
      await prisma.budgetAlert.upsert({
        where: {
          entityType_entityId_thresholdPercent: {
            entityType: 'team',
            entityId: team.id,
            thresholdPercent: threshold,
          },
        },
        update: {},
        create: {
          entityType: 'team',
          entityId: team.id,
          teamId: team.id,
          thresholdPercent: threshold,
        },
      });
    }
  }

  console.log('Seed completed successfully');
  console.log(`  Standard tier: ${BUDGET_TIERS.standard.monthlyTokenLimit.toLocaleString()} tokens/month (~$20)`);
  console.log(`  Premium tier:  ${BUDGET_TIERS.premium.monthlyTokenLimit.toLocaleString()} tokens/month (~$200)`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
