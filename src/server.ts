import { existsSync } from "node:fs";
import closeWithGrace from "close-with-grace";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { DOCS_ROUTE_PREFIX } from "./plugins/swagger.js";

if (existsSync(".env")) {
    process.loadEnvFile(".env");
}

const config = loadConfig();
const app = await buildApp(config);

const address = await app.listen({ host: config.HOST, port: config.PORT });

app.log.info(`API documentation available at ${address}${DOCS_ROUTE_PREFIX}`);

closeWithGrace({ delay: 10_000 }, async ({ err, signal }) => {
    if (err !== undefined) {
        app.log.error({ err }, "server closing due to an error");
    } else {
        app.log.info(`received ${signal ?? "shutdown"}, closing server`);
    }

    await app.close();
});
