import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  ANTHROPIC_API_KEY: z.string(),

  AZURE_TENANT_ID: z.string().default('00000000-0000-0000-0000-000000000000'),
  AZURE_CLIENT_ID: z.string().default('00000000-0000-0000-0000-000000000000'),
  AZURE_AUDIENCE: z.string().default('api://marcelia'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  CORS_ORIGIN: z.string().default('*'),

  RATE_LIMIT_MAX: z.coerce.number().default(20),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(60),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // Treat empty strings as undefined so Zod defaults apply
  const cleaned: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    cleaned[key] = value === '' ? undefined : value;
  }
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
