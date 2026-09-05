import type { S3Client } from "@aws-sdk/client-s3";
import type { Redis } from "ioredis";
import type { PrismaClient } from "@/generated/prisma/client.js";
import type { AppConfig } from "@/config.js";
import type { TaskPublicApi } from "@/modules/task/task.ports.js";
import type { UserPublicApi } from "@/modules/user/user.ports.js";

/**
 * The one place decorations are typed, and the ceiling on what any code in the
 * app can reach through them.
 *
 * Module services are declared as their module's PUBLIC API — the narrow type
 * at the bottom of its *.ports.ts — never as the full service type.
 * `decorate()` still accepts the real service (it satisfies the narrower type
 * structurally), but a caller sees only what the module published — so
 * `fastify.userService.setAvatar(...)` from an unrelated module is a compile
 * error, not a boundary violation nobody notices.
 *
 * This app-level file may import module types; modules import each other's
 * *.ports.ts directly and nothing else.
 */
declare module "fastify" {
    interface FastifyInstance {
        config: AppConfig;
        prisma: PrismaClient;
        s3: S3Client;
        redis: Redis;
        taskService: TaskPublicApi;
        userService: UserPublicApi;
    }
}
