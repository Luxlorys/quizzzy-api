import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env on its own; load it explicitly so the
// migrate/studio CLI commands see DATABASE_URL. Already-set variables win.
if (existsSync(".env")) {
    process.loadEnvFile(".env");
}

// Fallback matches docker-compose.yml, so `prisma generate` (which never
// connects) and local `prisma migrate` against the compose database both work
// before a .env exists.
const databaseUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/app";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        url: databaseUrl,
    },
});
