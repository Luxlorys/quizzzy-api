import {
    AttemptNotFoundError,
    QuizArticleMissingError,
    QuizNotFoundError,
} from "./quiz.errors.js";
import type {
    Attempt,
    AttemptSummary,
    Question,
    Quiz,
    QuizSort,
    QuizSummary,
} from "./quiz.entity.js";
import type { AttemptRepository, QuizRepository } from "./quiz.ports.js";
import { pageOf } from "@/lib/pagination.js";
import type { Prisma, PrismaClient } from "@/generated/prisma/client.js";

const quizInclude = {
    questions: {
        orderBy: { position: "asc" },
        include: { options: { orderBy: { id: "asc" } } },
    },
} satisfies Prisma.QuizInclude;

const summaryInclude = {
    _count: { select: { questions: true } },
} satisfies Prisma.QuizInclude;

type QuizRow = Prisma.QuizGetPayload<{ include: typeof quizInclude }>;
type QuizSummaryRow = Prisma.QuizGetPayload<{ include: typeof summaryInclude }>;
type QuestionRow = QuizRow["questions"][number];
type AttemptRow = Prisma.AttemptGetPayload<{ include: { answers: true } }>;

const ORDER_BY: Record<QuizSort, Prisma.QuizOrderByWithRelationInput[]> = {
    newest: [{ createdAt: "desc" }, { id: "desc" }],
    title: [{ title: "asc" }, { id: "asc" }],
};

const toQuestion = (row: QuestionRow): Question => ({
    id: row.id,
    position: row.position,
    kind: row.kind,
    prompt: row.prompt,
    explanation: row.explanation,
    options: row.options.map((option) => ({
        id: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
    })),
});

const toQuiz = (row: QuizRow): Quiz => ({
    id: row.id,
    articleId: row.articleId,
    title: row.title,
    topic: row.topic,
    sourceName: row.sourceName,
    questions: row.questions.map(toQuestion),
    createdAt: row.createdAt,
});

const toQuizSummary = (row: QuizSummaryRow): QuizSummary => ({
    id: row.id,
    title: row.title,
    topic: row.topic,
    sourceName: row.sourceName,
    questionCount: row._count.questions,
    createdAt: row.createdAt,
});

const toAttempt = (row: AttemptRow): Attempt => ({
    id: row.id,
    quizId: row.quizId,
    status: row.status,
    currentIndex: row.currentIndex,
    answers: row.answers.map((answer) => ({
        questionId: answer.questionId,
        selectedOptionIds: answer.selectedOptionIds,
    })),
    score: row.score,
    total: row.total,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
});

const toAttemptSummary = (row: Omit<AttemptRow, "answers">): AttemptSummary => ({
    id: row.id,
    quizId: row.quizId,
    status: row.status,
    currentIndex: row.currentIndex,
    score: row.score,
    total: row.total,
    submittedAt: row.submittedAt,
});

const searchFilter = (search: string | undefined): Prisma.QuizWhereInput =>
    search === undefined
        ? {}
        : {
              OR: [
                  { title: { contains: search, mode: "insensitive" } },
                  { topic: { contains: search, mode: "insensitive" } },
              ],
          };

const hasPrismaCode = (error: unknown, code: string): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;

const RECORD_NOT_FOUND = "P2025";
const FOREIGN_KEY_VIOLATION = "P2003";

const onMissingQuiz = (error: unknown): never => {
    if (
        hasPrismaCode(error, RECORD_NOT_FOUND) ||
        hasPrismaCode(error, FOREIGN_KEY_VIOLATION)
    ) {
        throw new QuizNotFoundError();
    }

    throw error;
};

const onMissingArticle = (error: unknown): never => {
    if (hasPrismaCode(error, FOREIGN_KEY_VIOLATION)) {
        throw new QuizArticleMissingError();
    }

    throw error;
};

const onMissingAttempt = (error: unknown): never => {
    if (hasPrismaCode(error, RECORD_NOT_FOUND)) {
        throw new AttemptNotFoundError();
    }

    throw error;
};

export const createPrismaQuizRepository = (
    prisma: PrismaClient,
): QuizRepository => ({
    create: async (data) => {
        const row = await prisma.quiz
            .create({
                data: {
                    articleId: data.articleId,
                    title: data.title,
                    topic: data.topic,
                    sourceName: data.sourceName,
                    questions: {
                        create: data.questions.map((question) => ({
                            position: question.position,
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
                },
                include: quizInclude,
            })
            .catch(onMissingArticle);

        return toQuiz(row);
    },

    findById: async (id) => {
        const row = await prisma.quiz.findUnique({
            where: { id },
            include: quizInclude,
        });

        return row === null ? null : toQuiz(row);
    },

    save: async (quiz) => {
        const row = await prisma.quiz
            .update({
                where: { id: quiz.id },
                data: { title: quiz.title, topic: quiz.topic },
                include: quizInclude,
            })
            .catch(onMissingQuiz);

        return toQuiz(row);
    },

    remove: async (id) => {
        await prisma.quiz.delete({ where: { id } }).catch(onMissingQuiz);
    },

    list: async ({ limit, cursor, search, sort }) => {
        const rows = await prisma.quiz.findMany({
            where: searchFilter(search),
            orderBy: ORDER_BY[sort],
            take: limit + 1,
            ...(cursor !== undefined && { cursor: { id: cursor }, skip: 1 }),
            include: summaryInclude,
        });

        return pageOf(rows, limit, toQuizSummary);
    },
});

export const createPrismaAttemptRepository = (
    prisma: PrismaClient,
): AttemptRepository => ({
    create: async (data) => {
        const row = await prisma.attempt
            .create({
                data: {
                    quizId: data.quizId,
                    currentIndex: data.currentIndex,
                    startedAt: data.startedAt,
                },
                include: { answers: true },
            })
            .catch(onMissingQuiz);

        return toAttempt(row);
    },

    findById: async (id) => {
        const row = await prisma.attempt.findUnique({
            where: { id },
            include: { answers: true },
        });

        return row === null ? null : toAttempt(row);
    },

    save: async (attempt) => {
        const row = await prisma.attempt
            .update({
                where: { id: attempt.id },
                data: {
                    status: attempt.status,
                    currentIndex: attempt.currentIndex,
                    score: attempt.score,
                    total: attempt.total,
                    submittedAt: attempt.submittedAt,
                    answers: {
                        deleteMany: {},
                        create: attempt.answers.map((answer) => ({
                            questionId: answer.questionId,
                            selectedOptionIds: answer.selectedOptionIds,
                        })),
                    },
                },
                include: { answers: true },
            })
            .catch(onMissingAttempt);

        return toAttempt(row);
    },

    findLatestForQuizzes: async (quizIds) => {
        if (quizIds.length === 0) {
            return [];
        }

        const rows = await prisma.attempt.findMany({
            where: { quizId: { in: quizIds } },
            orderBy: { id: "desc" },
            distinct: ["quizId"],
        });

        return rows.map(toAttemptSummary);
    },
});
