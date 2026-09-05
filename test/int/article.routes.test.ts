import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "./helpers/build-test-app.js";
import type { FastifyInstance } from "fastify";

const HTML = "<html><body><p>Consumer groups explained</p></body></html>";

describe("article routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        app = await buildTestApp();

        return async () => {
            await app.close();
        };
    });

    it("carries an article from submission to source read to deletion", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/api/articles",
            payload: { filename: "kafka-consumer-groups.html", html: HTML },
        });

        expect(created.statusCode).toBe(201);

        const article = created.json<{ id: number }>();

        const fetched = await app.inject({
            method: "GET",
            url: `/api/articles/${article.id}`,
        });

        expect(fetched.statusCode).toBe(200);
        expect(fetched.json()).toMatchObject({
            id: article.id,
            filename: "kafka-consumer-groups.html",
        });

        const source = await app.inject({
            method: "GET",
            url: `/api/articles/${article.id}/source`,
        });

        expect(source.statusCode).toBe(200);
        expect(source.json()).toMatchObject({ html: HTML });

        const deleted = await app.inject({
            method: "DELETE",
            url: `/api/articles/${article.id}`,
        });

        expect(deleted.statusCode).toBe(204);

        const gone = await app.inject({
            method: "GET",
            url: `/api/articles/${article.id}`,
        });

        expect(gone.statusCode).toBe(404);
        expect(gone.json()).toEqual({ message: "Article not found." });
    });

    it("rejects a file that is not a saved web page", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/articles",
            payload: { filename: "notes.pdf", html: HTML },
        });

        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({
            message: "Only .html and .htm files can be submitted.",
        });
    });

    it("rejects a malformed body at the edge", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/articles",
            payload: { filename: "", html: "" },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json<{ message: string }>().message).toMatch(
            /^Validation error:/,
        );
    });
});
