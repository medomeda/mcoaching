import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/pg/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
