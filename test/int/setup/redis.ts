import { GenericContainer, Wait } from "testcontainers";

/**
 * One throwaway Redis for the run. Workers share the server but not the data:
 * each takes its own logical database via the URL path (redis://host:port/<n>),
 * and reset-redis.ts FLUSHDBs between tests. Redis ships 16 databases by
 * default and the lane is capped to 8 workers, so the indices always fit.
 */
export const startRedis = async () => {
    const container = await new GenericContainer("redis:8-alpine")
        .withCommand(["redis-server", "--save", "", "--appendonly", "no"])
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
        .start();

    const uri = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;

    return { container, uri };
};

export const withRedisDatabase = (uri: string, index: number) => {
    const url = new URL(uri);

    url.pathname = `/${index}`;

    return url.toString();
};
