import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { GenericContainer, Wait } from "testcontainers";

/**
 * MinIO stands in for S3 in the integration lane: same wire protocol, runs as
 * a throwaway container, needs no AWS account. The app under test talks to it
 * through the exact same adapter and plugin it uses in production — only the
 * endpoint differs.
 */
export const MINIO_CREDENTIALS = {
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin",
};

export const TEST_AVATARS_BUCKET = "avatars";

export const startMinio = async () => {
    const container = await new GenericContainer("minio/minio:latest")
        .withCommand(["server", "/data"])
        .withEnvironment({
            MINIO_ROOT_USER: MINIO_CREDENTIALS.accessKeyId,
            MINIO_ROOT_PASSWORD: MINIO_CREDENTIALS.secretAccessKey,
        })
        .withExposedPorts(9000)
        .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
        .start();

    const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;

    const s3 = new S3Client({
        region: "us-east-1",
        endpoint,
        forcePathStyle: true,
        credentials: MINIO_CREDENTIALS,
    });

    try {
        await s3.send(new CreateBucketCommand({ Bucket: TEST_AVATARS_BUCKET }));
    } finally {
        s3.destroy();
    }

    return { container, endpoint };
};
