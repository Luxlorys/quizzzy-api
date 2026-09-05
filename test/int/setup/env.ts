import { tmpdir } from "node:os";
import path from "node:path";
import { inject } from "vitest";
import { withRedisDatabase } from "./redis.js";
import { withDatabase, workerDatabaseName } from "./workers.js";

// Each vitest worker owns one of the databases cloned in global.ts, so files
// can run in parallel without seeing each other's rows. This file is listed
// first in setupFiles so the variables are set before anything reads them.
const poolId = Number(process.env.VITEST_POOL_ID ?? 1);

process.env.DATABASE_URL = withDatabase(
    inject("databaseUri"),
    workerDatabaseName(poolId),
);

// Each worker gets its own Redis logical database, flushed between tests by
// reset-redis.ts — the cache twin of the per-worker Postgres database above.
process.env.REDIS_URL = withRedisDatabase(inject("redisUri"), poolId);

// Article HTML lands in a throwaway directory per worker, removed with the
// run — the filesystem twin of the per-worker database above.
process.env.ARTICLE_STORAGE_DIR = path.join(
    tmpdir(),
    `quizzzy-int-articles-${poolId}`,
);
