import fp from "fastify-plugin";
import { S3Client } from "@aws-sdk/client-s3";
import type { FastifyInstance } from "fastify";

/**
 * Owns the S3 client lifecycle — and nothing else. No buckets, no keys, no
 * upload logic: the plugin provides the raw client; what the bytes are FOR is
 * a module's port (`AvatarRepository` in modules/user/user.ports.ts), and how
 * it maps to S3 is that module's implementation (user.s3.repository.ts).
 *
 * Constructing the client opens no connection, so booting without AWS
 * credentials is safe — the SDK dials only when a command is sent.
 */
const s3 = async (fastify: FastifyInstance) => {
    const { S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } =
        fastify.config;

    const client = new S3Client({
        region: S3_REGION,
        ...(S3_ENDPOINT !== undefined && {
            endpoint: S3_ENDPOINT,
            forcePathStyle: true,
        }),
        ...(S3_ACCESS_KEY_ID !== undefined &&
            S3_SECRET_ACCESS_KEY !== undefined && {
                credentials: {
                    accessKeyId: S3_ACCESS_KEY_ID,
                    secretAccessKey: S3_SECRET_ACCESS_KEY,
                },
            }),
    });

    fastify.decorate("s3", client);

    fastify.addHook("onClose", async (instance) => {
        instance.s3.destroy();
    });
};

export default fp(s3, { name: "s3" });
