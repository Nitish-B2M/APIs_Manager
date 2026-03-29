import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL is required and must be a valid URL"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  PORT: z.string().optional().default("4001"),
  ALLOWED_ORIGIN: z.string().optional().default("http://localhost:3000"),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Add other env variables found in package.json/index.ts
  GEMINI_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("❌ Invalid environment variables:", result.error.format());
  process.exit(1);
}

export const env = result.data;
