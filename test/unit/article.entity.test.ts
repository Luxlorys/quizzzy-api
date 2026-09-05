import { describe, expect, it } from "vitest";
import { acceptSubmission, draftArticle } from "@/modules/article/article.entity.js";
import {
    EmptyArticleError,
    UnsupportedArticleFormatError,
} from "@/modules/article/article.errors.js";

describe("acceptSubmission", () => {
    it("accepts .html and .htm regardless of case", () => {
        const html = "<html><body>content</body></html>";

        expect(acceptSubmission({ filename: "a.HTML", html }).filename).toBe(
            "a.HTML",
        );
        expect(acceptSubmission({ filename: "a.htm", html }).filename).toBe("a.htm");
    });

    it("rejects any other extension", () => {
        expect(() =>
            acceptSubmission({ filename: "article.pdf", html: "<p>x</p>" }),
        ).toThrow(UnsupportedArticleFormatError);
    });

    it("rejects a blank document", () => {
        expect(() =>
            acceptSubmission({ filename: "article.html", html: "   \n  " }),
        ).toThrow(EmptyArticleError);
    });
});

describe("draftArticle", () => {
    it("records the filename against the key its source was stored under", () => {
        const draft = draftArticle(
            { filename: "aws-lambda-cold-starts.html", html: "<p>x</p>" },
            "abc-aws-lambda-cold-starts.html",
        );

        expect(draft).toEqual({
            filename: "aws-lambda-cold-starts.html",
            sourceKey: "abc-aws-lambda-cold-starts.html",
        });
    });
});
