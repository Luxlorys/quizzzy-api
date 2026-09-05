import { GetObjectCommand } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it } from "vitest";
import { createS3AvatarRepository } from "@/modules/user/user.s3.repository.js";
import { buildTestApp } from "./helpers/build-test-app.js";
import type { FastifyInstance } from "fastify";
import type { AvatarRepository } from "@/modules/user/user.ports.js";

/**
 * Implementation contract test: the S3 implementation of the AvatarRepository port
 * against a real S3 API (MinIO from the integration setup). This is what
 * licenses the in-memory implementation used by the unit lane.
 */
describe("s3 avatar repository", () => {
    let app: FastifyInstance;
    let avatars: AvatarRepository;

    beforeEach(async () => {
        app = await buildTestApp();
        avatars = createS3AvatarRepository(app.s3, app.config.S3_AVATARS_BUCKET);

        return async () => {
            await app.close();
        };
    });

    it("stores the bytes with their content type and returns a user-scoped key", async () => {
        const body = Buffer.from("fake-png-bytes");

        const key = await avatars.uploadAvatar({
            userId: 42,
            body,
            contentType: "image/png",
        });

        expect(key).toMatch(/^avatars\/42\//);

        const stored = await app.s3.send(
            new GetObjectCommand({
                Bucket: app.config.S3_AVATARS_BUCKET,
                Key: key,
            }),
        );

        expect(stored.ContentType).toBe("image/png");

        const bytes = Buffer.from((await stored.Body?.transformToByteArray()) ?? []);

        expect(bytes.equals(body)).toBe(true);
    });

    it("never reuses a key, so re-uploads don't clobber in-flight reads", async () => {
        const first = await avatars.uploadAvatar({
            userId: 42,
            body: Buffer.from("one"),
            contentType: "image/png",
        });

        const second = await avatars.uploadAvatar({
            userId: 42,
            body: Buffer.from("two"),
            contentType: "image/png",
        });

        expect(second).not.toBe(first);
    });
});
