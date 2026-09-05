import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import type { AvatarRepository } from "./user.ports.js";

export const createS3AvatarRepository = (
    s3: S3Client,
    bucket: string,
): AvatarRepository => ({
    uploadAvatar: async ({ userId, body, contentType }) => {
        const key = `avatars/${userId}/${randomUUID()}`;

        await s3.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
            }),
        );

        return key;
    },
});
