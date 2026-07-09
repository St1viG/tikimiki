import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs this config directly (it doesn't import the app's
// config/env.ts), so DATABASE_URL wouldn't otherwise be loaded and migrate
// would fall back to the :5432 default. Load backend/.env then the repo-root
// .env (shared with docker-compose) to match backend/src/config/env.ts.
for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "..", ".env")]) {
  loadEnv({ path: candidate });
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://tikimiki:tikimiki@localhost:5432/tikimiki",
  },
  verbose: true,
  strict: true,
});
