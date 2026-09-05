import { Client } from "pg";
import { afterAll, beforeEach } from "vitest";

let client: Client | null = null;
let cachedTableList: string[] | null = null;

const quoteIdentifier = (name: string) => `"${name.replace(/"/g, '""')}"`;

const getClient = async () => {
    if (client) {
        return client;
    }

    const databaseUrl = process.env.DATABASE_URL;

    // Refuse to truncate anything that is not one of the throwaway databases
    // provisioned by global.ts — a guard against ever pointing this file at a
    // real database.
    if (!databaseUrl?.includes("int_test")) {
        throw new Error(
            "reset-db: DATABASE_URL does not look like an integration-test database — " +
                "env.ts must run before this file in setupFiles.",
        );
    }

    client = new Client({ connectionString: databaseUrl });

    await client.connect();

    return client;
};

const loadTableList = async () => {
    if (cachedTableList) {
        return cachedTableList;
    }

    const connection = await getClient();

    const { rows } = await connection.query<{ tablename: string }>(
        `SELECT tablename
         FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename <> '_prisma_migrations'`,
    );

    cachedTableList = rows.map((row) => quoteIdentifier(row.tablename));

    return cachedTableList;
};

beforeEach(async () => {
    const connection = await getClient();
    const tableList = await loadTableList();

    if (tableList.length === 0) {
        return;
    }

    await connection.query(
        `TRUNCATE ${tableList.join(",")} RESTART IDENTITY CASCADE`,
    );
});

afterAll(async () => {
    await client?.end();

    client = null;
});
