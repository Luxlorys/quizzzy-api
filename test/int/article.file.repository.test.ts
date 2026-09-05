import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ArticleSourceMissingError } from "@/modules/article/article.errors.js";
import { createFileArticleSourceRepository } from "@/modules/article/article.file.repository.js";

const HTML = "<html><body><p>Consumer groups explained</p></body></html>";

describe("filesystem article source repository", () => {
    let directory: string;
    let sources: ReturnType<typeof createFileArticleSourceRepository>;

    beforeAll(async () => {
        directory = path.join(
            await mkdtemp(path.join(tmpdir(), "quizzzy-articles-")),
            "nested",
        );

        sources = createFileArticleSourceRepository(directory);
    });

    afterAll(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    it("creates the directory on first write and round-trips the source", async () => {
        const key = await sources.storeSource({
            filename: "kafka-consumer-groups.html",
            html: HTML,
        });

        expect(key).toMatch(/-kafka-consumer-groups\.html$/);

        await expect(sources.readSource(key)).resolves.toBe(HTML);
        await expect(readdir(directory)).resolves.toContain(key);
    });

    it("gives every upload its own key", async () => {
        const submission = { filename: "same-name.html", html: HTML };

        const first = await sources.storeSource(submission);
        const second = await sources.storeSource(submission);

        expect(first).not.toBe(second);
    });

    it("keeps a hostile filename inside the storage directory", async () => {
        const key = await sources.storeSource({
            filename: "../../../etc/passwd.html",
            html: HTML,
        });

        expect(key).not.toContain("/");
        await expect(readdir(directory)).resolves.toContain(key);
    });

    it("refuses to read outside the storage directory", async () => {
        const outside = path.join(directory, "..", "escaped.html");

        await writeFile(outside, "should not be readable through a key");

        await expect(sources.readSource("../escaped.html")).rejects.toThrow(
            ArticleSourceMissingError,
        );

        await rm(outside, { force: true });
    });

    it("translates a missing file into a domain error", async () => {
        await expect(sources.readSource("nope.html")).rejects.toThrow(
            ArticleSourceMissingError,
        );
    });

    it("removes a source and tolerates removing it twice", async () => {
        const key = await sources.storeSource({
            filename: "removable.html",
            html: HTML,
        });

        await sources.removeSource(key);
        await expect(sources.removeSource(key)).resolves.toBeUndefined();

        await expect(sources.readSource(key)).rejects.toThrow(
            ArticleSourceMissingError,
        );
    });
});
