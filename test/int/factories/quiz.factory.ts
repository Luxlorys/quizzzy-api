import { randomUUID } from "node:crypto";
import { createArticle } from "./article.factory.js";
import type { Prisma, PrismaClient } from "@/generated/prisma/client.js";

/**
 * Seeds a quiz with its questions and options, creating the article it hangs
 * off unless the caller supplies one. Ids are read off the returned rows —
 * TRUNCATE restarts the sequences between tests.
 */
type QuestionSeed = {
    kind: Prisma.QuestionUncheckedCreateInput["kind"];
    prompt: string;
    explanation: string;
    options: { text: string; isCorrect: boolean }[];
};

type CreateQuizArgs = {
    prisma: PrismaClient;
    articleId?: number;
    overrides?: Partial<Prisma.QuizUncheckedCreateInput>;
    questions?: QuestionSeed[];
};

export const DEFAULT_QUESTIONS: QuestionSeed[] = [
    {
        kind: "single",
        prompt: "What causes a Lambda cold start?",
        explanation: "A fresh execution environment has to be initialized.",
        options: [
            { text: "A new execution environment", isCorrect: true },
            { text: "Low memory", isCorrect: false },
        ],
    },
    {
        kind: "multi",
        prompt: "Which reduce cold start duration?",
        explanation: "Warm environments and a smaller init do.",
        options: [
            { text: "Provisioned concurrency", isCorrect: true },
            { text: "Smaller package", isCorrect: true },
            { text: "Clients inside the handler", isCorrect: false },
        ],
    },
];

const quizInclude = {
    questions: {
        orderBy: { position: "asc" },
        include: { options: { orderBy: { id: "asc" } } },
    },
} satisfies Prisma.QuizInclude;

export const createQuiz = async ({
    prisma,
    articleId,
    overrides = {},
    questions = DEFAULT_QUESTIONS,
}: CreateQuizArgs) => {
    const article = articleId ?? (await createArticle({ prisma })).id;

    return prisma.quiz.create({
        data: {
            articleId: article,
            title: `quiz-${randomUUID()}`,
            topic: "AWS",
            sourceName: "lambda-deep-dive.html",
            questions: {
                create: questions.map((question, questionIndex) => ({
                    position: questionIndex,
                    kind: question.kind,
                    prompt: question.prompt,
                    explanation: question.explanation,
                    options: {
                        create: question.options.map((option) => ({
                            text: option.text,
                            isCorrect: option.isCorrect,
                        })),
                    },
                })),
            },
            ...overrides,
        },
        include: quizInclude,
    });
};
