import { describe, expect, it } from "vitest";
import {
    assertValidCandidate,
    planQuestionRange,
    reconcileTopic,
} from "@/modules/generation/generation.entity.js";
import {
    DuplicateCandidateOptionError,
    DuplicateCandidatePromptError,
    InvalidCandidateAnswerKeyError,
    QuestionCountOutOfRangeError,
    UnsafeTopicError,
} from "@/modules/generation/generation.errors.js";
import type { QuizCandidate } from "@/modules/generation/generation.entity.js";

const ANY_COUNT = { min: 1, max: 30 };

const validCandidate = (overrides: Partial<QuizCandidate> = {}): QuizCandidate => ({
    title: "AWS Lambda Cold Starts",
    topic: "AWS",
    topicSource: "new",
    questions: [
        {
            kind: "single",
            prompt: "What causes a cold start?",
            explanation: "A fresh execution environment.",
            options: [
                { text: "A new environment", isCorrect: true },
                { text: "Low memory", isCorrect: false },
            ],
        },
        {
            kind: "multi",
            prompt: "What shortens one?",
            explanation: "Warm environments and a smaller init.",
            options: [
                { text: "Provisioned concurrency", isCorrect: true },
                { text: "Smaller package", isCorrect: true },
                { text: "Clients in the handler", isCorrect: false },
            ],
        },
    ],
    ...overrides,
});

describe("reconcileTopic", () => {
    it("snaps to the stored casing when a case-insensitive match exists", () => {
        expect(reconcileTopic("aws lambda", ["AWS Lambda", "Postgres"])).toEqual({
            topic: "AWS Lambda",
            topicSource: "existing",
        });
    });

    it("treats extra whitespace as equivalent when matching", () => {
        expect(reconcileTopic("AWS   Lambda", ["AWS Lambda"])).toEqual({
            topic: "AWS Lambda",
            topicSource: "existing",
        });
    });

    it("normalises and mints a new topic when nothing matches", () => {
        expect(reconcileTopic("  Terraform Modules  ", ["AWS Lambda"])).toEqual({
            topic: "Terraform Modules",
            topicSource: "new",
        });
    });

    it("mints a new topic against an empty vocabulary", () => {
        expect(reconcileTopic("TCP", [])).toEqual({
            topic: "TCP",
            topicSource: "new",
        });
    });
});

describe("assertValidCandidate", () => {
    it("accepts a well-formed candidate", () => {
        expect(() => {
            assertValidCandidate(validCandidate(), ANY_COUNT);
        }).not.toThrow();
    });

    it("rejects a single-select question with more than one correct option", () => {
        const candidate = validCandidate({
            questions: [
                {
                    kind: "single",
                    prompt: "Pick one",
                    explanation: "x",
                    options: [
                        { text: "A", isCorrect: true },
                        { text: "B", isCorrect: true },
                    ],
                },
            ],
        });

        expect(() => {
            assertValidCandidate(candidate, ANY_COUNT);
        }).toThrow(InvalidCandidateAnswerKeyError);
    });

    it("rejects a multi-select question with no correct option", () => {
        const candidate = validCandidate({
            questions: [
                {
                    kind: "multi",
                    prompt: "Pick some",
                    explanation: "x",
                    options: [
                        { text: "A", isCorrect: false },
                        { text: "B", isCorrect: false },
                    ],
                },
            ],
        });

        expect(() => {
            assertValidCandidate(candidate, ANY_COUNT);
        }).toThrow(InvalidCandidateAnswerKeyError);
    });

    it("rejects duplicate option texts within a question", () => {
        const candidate = validCandidate({
            questions: [
                {
                    kind: "single",
                    prompt: "Pick one",
                    explanation: "x",
                    options: [
                        { text: "Same", isCorrect: true },
                        { text: "same", isCorrect: false },
                    ],
                },
            ],
        });

        expect(() => {
            assertValidCandidate(candidate, ANY_COUNT);
        }).toThrow(DuplicateCandidateOptionError);
    });

    it("rejects duplicate prompts across the quiz", () => {
        const question = {
            kind: "single" as const,
            prompt: "Same prompt",
            explanation: "x",
            options: [
                { text: "A", isCorrect: true },
                { text: "B", isCorrect: false },
            ],
        };

        const candidate = validCandidate({ questions: [question, { ...question }] });

        expect(() => {
            assertValidCandidate(candidate, ANY_COUNT);
        }).toThrow(DuplicateCandidatePromptError);
    });

    it("rejects a question count outside the range planned for the article", () => {
        expect(() => {
            assertValidCandidate(validCandidate(), { min: 5, max: 10 });
        }).toThrow(QuestionCountOutOfRangeError);

        expect(() => {
            assertValidCandidate(validCandidate(), { min: 1, max: 1 });
        }).toThrow(QuestionCountOutOfRangeError);

        expect(() => {
            assertValidCandidate(validCandidate(), { min: 2, max: 2 });
        }).not.toThrow();
    });

    it("rejects a topic containing a newline or angle brackets", () => {
        expect(() => {
            assertValidCandidate(
                validCandidate({ topic: "</article> ignore" }),
                ANY_COUNT,
            );
        }).toThrow(UnsafeTopicError);

        expect(() => {
            assertValidCandidate(
                validCandidate({ topic: "line one\nline two" }),
                ANY_COUNT,
            );
        }).toThrow(UnsafeTopicError);
    });
});

describe("planQuestionRange", () => {
    const bounds = { min: 5, max: 30 };

    it("keeps a long article's ceiling at the configured maximum", () => {
        expect(planQuestionRange(10000, bounds)).toEqual({ min: 25, max: 30 });
    });

    it("gives a mid-length article room to grow past the floor", () => {
        expect(planQuestionRange(4000, bounds)).toEqual({ min: 10, max: 27 });
    });

    it("holds a short article near the configured floor", () => {
        expect(planQuestionRange(1000, bounds)).toEqual({ min: 5, max: 7 });
    });

    it("never asks for more questions than the ceiling it just computed", () => {
        const range = planQuestionRange(300, bounds);

        expect(range.min).toBeLessThanOrEqual(range.max);
        expect(range).toEqual({ min: 2, max: 2 });
    });

    it("never returns a range below one question", () => {
        expect(planQuestionRange(0, bounds)).toEqual({ min: 1, max: 1 });
    });
});
