import { defineConfig } from "drizzle-kit";

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
