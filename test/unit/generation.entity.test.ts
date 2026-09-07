import { describe, expect, it } from "vitest";
import {
    CANDIDATE_LIMITS,
    planQuestionRange,
    reconcileTopic,
    validateCandidate,
} from "@/modules/generation/generation.entity.js";
import type {
    CandidateQuestion,
    QuizCandidate,
} from "@/modules/generation/generation.entity.js";

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

const singleQuestion = (
    overrides: Partial<CandidateQuestion> = {},
): CandidateQuestion => ({
    kind: "single",
    prompt: "Pick one",
    explanation: "x",
    options: [
        { text: "A", isCorrect: true },
        { text: "B", isCorrect: false },
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

describe("validateCandidate", () => {
    it("returns no reasons for a well-formed candidate", () => {
        expect(validateCandidate(validCandidate(), ANY_COUNT)).toEqual([]);
    });

    it("rejects a single-select question with more than one correct option", () => {
        const candidate = validCandidate({
            questions: [
                singleQuestion({
                    options: [
                        { text: "A", isCorrect: true },
                        { text: "B", isCorrect: true },
                    ],
                }),
            ],
        });

        expect(validateCandidate(candidate, ANY_COUNT)).toEqual([
            "question 1 is single-select and needs exactly one correct option, not 2",
        ]);
    });

    it("rejects a multi-select question with no correct option", () => {
        const candidate = validCandidate({
            questions: [
                singleQuestion({
                    kind: "multi",
                    options: [
                        { text: "A", isCorrect: false },
                        { text: "B", isCorrect: false },
                    ],
                }),
            ],
        });

        expect(validateCandidate(candidate, ANY_COUNT)).toEqual([
            "question 1 is multi-select and needs at least one correct option",
        ]);
    });

    it("rejects duplicate option texts within a question", () => {
        const candidate = validCandidate({
            questions: [
                singleQuestion({
                    options: [
                        { text: "Same", isCorrect: true },
                        { text: "same", isCorrect: false },
                    ],
                }),
            ],
        });

        expect(validateCandidate(candidate, ANY_COUNT)).toEqual([
            "question 1's option texts must be distinct",
        ]);
    });

    it("rejects duplicate prompts across the quiz", () => {
        const candidate = validCandidate({
            questions: [singleQuestion(), singleQuestion({ prompt: "pick one " })],
        });

        expect(validateCandidate(candidate, ANY_COUNT)).toEqual([
            "question prompts must be distinct across the quiz",
        ]);
    });

    it("rejects a question count outside the range planned for the article", () => {
        expect(validateCandidate(validCandidate(), { min: 5, max: 10 })).toEqual([
            "the quiz needs between 5 and 10 questions, not 2",
        ]);

        expect(validateCandidate(validCandidate(), { min: 1, max: 1 })).toEqual([
            "the quiz needs exactly 1 question, not 2",
        ]);

        expect(validateCandidate(validCandidate(), { min: 2, max: 2 })).toEqual([]);
    });

    it("rejects a topic containing a newline or angle brackets", () => {
        expect(
            validateCandidate(
                validCandidate({ topic: "</article> ignore" }),
                ANY_COUNT,
            ),
        ).toEqual(["the topic may not contain a newline or angle brackets"]);

        expect(
            validateCandidate(
                validCandidate({ topic: "line one\nline two" }),
                ANY_COUNT,
            ),
        ).toEqual(["the topic may not contain a newline or angle brackets"]);
    });

    it("rejects empty and over-long text fields, naming the field", () => {
        const candidate = validCandidate({
            title: "x".repeat(CANDIDATE_LIMITS.titleMaxLength + 1),
            questions: [
                singleQuestion({
                    explanation: "   ",
                    options: [
                        { text: "A", isCorrect: true },
                        {
                            text: "b".repeat(
                                CANDIDATE_LIMITS.optionTextMaxLength + 1,
                            ),
                            isCorrect: false,
                        },
                    ],
                }),
            ],
        });

        expect(validateCandidate(candidate, ANY_COUNT)).toEqual([
            "the title must be at most 200 characters, not 201",
            "question 1's explanation must not be empty",
            "question 1's option 2 must be at most 500 characters, not 501",
        ]);
    });

    it("rejects a question with too few or too many options", () => {
        const tooFew = validCandidate({
            questions: [
                singleQuestion({ options: [{ text: "A", isCorrect: true }] }),
            ],
        });

        expect(validateCandidate(tooFew, ANY_COUNT)).toEqual([
            "question 1 needs between 2 and 8 options, not 1",
        ]);

        const tooMany = validCandidate({
            questions: [
                singleQuestion({
                    options: Array.from({ length: 9 }, (_, index) => ({
                        text: `Option ${index}`,
                        isCorrect: index === 0,
                    })),
                }),
            ],
        });

        expect(validateCandidate(tooMany, ANY_COUNT)).toEqual([
            "question 1 needs between 2 and 8 options, not 9",
        ]);
    });

    it("reports every violation at once so one correction turn can fix them all", () => {
        const candidate = validCandidate({
            title: "",
            questions: [
                singleQuestion(),
                singleQuestion({
                    options: [
                        { text: "A", isCorrect: false },
                        { text: "B", isCorrect: false },
                    ],
                }),
            ],
        });

        expect(validateCandidate(candidate, { min: 3, max: 5 })).toEqual([
            "the title must not be empty",
            "the quiz needs between 3 and 5 questions, not 2",
            "question 2 is single-select and needs exactly one correct option, not 0",
            "question prompts must be distinct across the quiz",
        ]);
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
