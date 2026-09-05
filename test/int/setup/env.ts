import { inject } from "vitest";
import { MINIO_CREDENTIALS, TEST_AVATARS_BUCKET } from "./minio.js";
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

// Object storage points at the MinIO container from global.ts. Workers share
// one bucket safely: avatar keys are unique per upload.
process.env.S3_ENDPOINT = inject("s3Endpoint");
process.env.S3_AVATARS_BUCKET = TEST_AVATARS_BUCKET;
process.env.S3_ACCESS_KEY_ID = MINIO_CREDENTIALS.accessKeyId;
process.env.S3_SECRET_ACCESS_KEY = MINIO_CREDENTIALS.secretAccessKey;

// Each worker gets its own Redis logical database, flushed between tests by
// reset-redis.ts — the cache twin of the per-worker Postgres database above.
process.env.REDIS_URL = withRedisDatabase(inject("redisUri"), poolId);
