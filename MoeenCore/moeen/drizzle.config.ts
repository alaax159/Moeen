import * as dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

dotenv.config({ override: true });

export default defineConfig({
  schema: './src/database/schema',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
