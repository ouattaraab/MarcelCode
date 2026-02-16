import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  AZURE_FOUNDRY_ENDPOINT: z.string().url(),
  AZURE_FOUNDRY_API_KEY: z.string().optional(),
  AZURE_USE_MANAGED_IDENTITY: z.coerce.boolean().default(false),

  AZURE_TENANT_ID: z.string(),
  AZURE_CLIENT_ID: z.string(),
  AZURE_AUDIENCE: z.string().default('api://marcelia'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  CORS_ORIGIN: z.string().default('*'),

  RATE_LIMIT_MAX: z.coerce.number().default(20),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(60),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
