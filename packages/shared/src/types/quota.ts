export interface QuotaStatus {
  userId: string;
  teamId: string | null;
  period: 'daily' | 'monthly';
  tokensUsed: number;
  tokensLimit: number;
  tokensRemaining: number;
  percentUsed: number;
  resetAt: Date;
}

export interface QuotaConfig {
  id: string;
  entityType: 'user' | 'team';
  entityId: string;
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
  maxRequestsPerMinute: number;
  allowedModels: string[];
}

export interface BudgetAlert {
  id: string;
  entityType: 'user' | 'team';
  entityId: string;
  thresholdPercent: number;
  notified: boolean;
  notifiedAt: Date | null;
}
