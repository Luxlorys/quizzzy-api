import fs from "node:fs/promises";
import path from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { startMinio } from "./minio.js";
import { startRedis } from "./redis.js";
import {
    INT_TEST_WORKERS,
    TEMPLATE_DATABASE,
    withDatabase,
    workerDatabaseName,
} from "./workers.js";
import type { TestProject } from "vitest/node";

declare module "vitest" {
    interface ProvidedContext {
        databaseUri: string;
        s3Endpoint: string;
        redisUri: string;
    }
}

/**
 * Applies the migration history file by file.
 *
 * Kept over a schema push because objects that live only in migration SQL —
 * triggers, functions, extensions, custom indexes — are not representable in
 * schema.prisma and would be silently missing from a schema-only push.
 */
const runMigrationFiles = async (client: Client) => {
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations");

    const migrationDirs = await fs.readdir(migrationsDir);

    const validDirs = migrationDirs
        .filter((file) => file !== "migration_lock.toml")
        .sort();

    for (const dir of validDirs) {
        const dirPath = path.join(migrationsDir, dir);
        const dirFiles = await fs.readdir(dirPath);
        const migrationFile = dirFiles.find((file) => file.endsWith(".sql"));

        if (!migrationFile) {
            throw new Error(`No migration file found in ${dirPath}`);
        }

        const migrationSQL = await fs.readFile(
            path.join(dirPath, migrationFile),
            "utf-8",
        );

        await client.query(migrationSQL);
    }
};

/**
 * Boots one throwaway Postgres, migrates a template database once, then
 * clones one database per vitest worker (per-test isolation is a TRUNCATE,
 * see reset-db.ts).
 */
const startPostgres = async () => {
    const container = await new PostgreSqlContainer("postgres:17-alpine")
        .withTmpFs({ "/var/lib/postgresql/data": "rw" })
        .start();

    const databaseUri = container.getConnectionUri();

    const admin = new Client({ connectionString: databaseUri });

    await admin.connect();

    try {
        await admin.query(`CREATE DATABASE "${TEMPLATE_DATABASE}"`);

        const template = new Client({
            connectionString: withDatabase(databaseUri, TEMPLATE_DATABASE),
        });

        await template.connect();

        try {
            await runMigrationFiles(template);
        } finally {
            await template.end();
        }

        // Sequential on purpose: Postgres refuses to copy a template that is
        // being read by another CREATE DATABASE at the same moment.
        for (let poolId = 1; poolId <= INT_TEST_WORKERS; poolId++) {
            await admin.query(
                `CREATE DATABASE "${workerDatabaseName(poolId)}" TEMPLATE "${TEMPLATE_DATABASE}"`,
            );
        }
    } finally {
        await admin.end();
    }

    return { container, databaseUri };
};

const globalSetup = async ({ provide }: TestProject) => {
    const [postgres, minio, redis] = await Promise.all([
        startPostgres(),
        startMinio(),
        startRedis(),
    ]);

    provide("databaseUri", postgres.databaseUri);
    provide("s3Endpoint", minio.endpoint);
    provide("redisUri", redis.uri);

    return async () => {
        await Promise.all([
            postgres.container.stop(),
            minio.container.stop(),
            redis.container.stop(),
        ]);
    };
};

export default globalSetup;
