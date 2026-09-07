import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp } from "./helpers/build-test-app.js";
import {
    cannedAttempt,
    createStubQuizGenerator,
} from "../helpers/stub-quiz-generator.js";
import type { QuizGenerator } from "@/modules/generation/ports/generator.port.js";
import type { FastifyInstance } from "fastify";

const ARTICLE_HTML =
    "<html><body><h1>Lambda cold starts</h1>" +
    "<p>A cold start happens when a fresh execution environment must be initialized " +
    "before your code can run. The platform downloads the package, starts the runtime, " +
    "and runs any initialization code that sits outside the handler.</p>" +
    "<p>Warm environments skip all of that, which is why steady traffic feels faster " +
    "than a burst after a long idle period.</p></body></html>";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const slowGenerator = (ms: number): QuizGenerator =>
    createStubQuizGenerator(async () => {
        await sleep(ms);

        return cannedAttempt();
    });

const uploadArticle = async (app: FastifyInstance): Promise<number> => {
    const response = await app.inject({
        method: "POST",
        url: "/api/articles",
        payload: { filename: "lambda.html", html: ARTICLE_HTML },
    });

    return response.json<{ id: number }>().id;
};

type GenerationBody = {
    id: number;
    status: string;
    quizId: number | null;
    failureCode: string | null;
};

const waitForTerminal = async (
    app: FastifyInstance,
    id: number,
): Promise<GenerationBody> => {
    for (let attempt = 0; attempt < 50; attempt++) {
        const response = await app.inject({
            method: "GET",
            url: `/api/generations/${id}`,
        });
        const body = response.json<GenerationBody>();

        if (body.status === "succeeded" || body.status === "failed") {
            return body;
        }

        await sleep(20);
    }

    throw new Error(`generation ${id} never settled`);
};

describe("generation routes", () => {
    let app: FastifyInstance;

    afterEach(async () => {
        await app.close();
    });

    it("starts a generation, returns 202, and settles as succeeded", async () => {
        app = await buildTestApp(
            {},
            { generation: { generator: createStubQuizGenerator() } },
        );

        const articleId = await uploadArticle(app);

        const started = await app.inject({
            method: "POST",
            url: "/api/generations",
            payload: { articleId },
        });

        expect(started.statusCode).toBe(202);
        expect(started.json()).toMatchObject({ status: "pending", quizId: null });

        const settled = await waitForTerminal(
            app,
            started.json<GenerationBody>().id,
        );

        expect(settled.status).toBe("succeeded");
        expect(settled.quizId).not.toBeNull();
    });

    it("returns 404 for an article that does not exist", async () => {
        app = await buildTestApp(
            {},
            { generation: { generator: createStubQuizGenerator() } },
        );

        const response = await app.inject({
            method: "POST",
            url: "/api/generations",
            payload: { articleId: 999_999 },
        });

        expect(response.statusCode).toBe(404);
    });

    it("refuses a second concurrent start with 409, and /active reports the running job", async () => {
        app = await buildTestApp(
            {},
            { generation: { generator: slowGenerator(300) } },
        );

        const articleId = await uploadArticle(app);

        const first = await app.inject({
            method: "POST",
            url: "/api/generations",
            payload: { articleId },
        });

        expect(first.statusCode).toBe(202);

        const active = await app.inject({
            method: "GET",
            url: "/api/generations/active",
        });

        expect(active.json()).toMatchObject({ id: first.json<GenerationBody>().id });

        const second = await app.inject({
            method: "POST",
            url: "/api/generations",
            payload: { articleId },
        });

        expect(second.statusCode).toBe(409);

        await waitForTerminal(app, first.json<GenerationBody>().id);
    });

    it("reports null from /active when nothing is running", async () => {
        app = await buildTestApp(
            {},
            { generation: { generator: createStubQuizGenerator() } },
        );

        const response = await app.inject({
            method: "GET",
            url: "/api/generations/active",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toBeNull();
    });

    it("returns 404 for a generation id that does not exist", async () => {
        app = await buildTestApp(
            {},
            { generation: { generator: createStubQuizGenerator() } },
        );

        const response = await app.inject({
            method: "GET",
            url: "/api/generations/999999",
        });

        expect(response.statusCode).toBe(404);
    });

    it("records a failed generation when the generator throws", async () => {
        app = await buildTestApp(
            {},
            {
                generation: {
                    generator: createStubQuizGenerator(async () => {
                        throw new Error("boom");
                    }),
                },
            },
        );

        const articleId = await uploadArticle(app);

        const started = await app.inject({
            method: "POST",
            url: "/api/generations",
            payload: { articleId },
        });

        const settled = await waitForTerminal(
            app,
            started.json<GenerationBody>().id,
        );

        expect(settled.status).toBe("failed");
        expect(settled.failureCode).toBe("GENERATION_INVALID_OUTPUT");
    });

    it("appears in the OpenAPI spec", async () => {
        app = await buildTestApp(
            {},
            { generation: { generator: createStubQuizGenerator() } },
        );

        const response = await app.inject({ method: "GET", url: "/docs/json" });
        const spec = response.json<{ paths: Record<string, unknown> }>();

        expect(Object.keys(spec.paths)).toContain("/api/generations/");
    });
});
