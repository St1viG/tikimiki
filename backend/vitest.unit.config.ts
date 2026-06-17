import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * DB-free unit subset. No global setup, no database — just the pure-logic
 * specs under `test/unit` (Zod schemas, etc.). Fast feedback that runs
 * anywhere, even without Postgres available.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["test/unit/**/*.spec.ts"],
  },
});
