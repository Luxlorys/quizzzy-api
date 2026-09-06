import { systemClock } from "@/lib/clock.js";
import { pageOf } from "@/lib/pagination.js";
import { QuizNotFoundError } from "@/modules/quiz/quiz.errors.js";
import type { Clock } from "@/lib/clock.js";
import type {
    NewQuestion,
    Question,
    Quiz,
    QuizSort,
    QuizSummary,
} from "@/modules/quiz/quiz.entity.js";
import type { QuizRepository } from "@/modules/quiz/ports/repository.port.js";

const matchesSearch = (quiz: Quiz, search: string | undefined): boolean => {
    if (search === undefined) {
        return true;
    }

    const term = search.toLowerCase();

    return (
        quiz.title.toLowerCase().includes(term) ||
        quiz.topic.toLowerCase().includes(term)
    );
};

const COMPARE: Record<QuizSort, (a: Quiz, b: Quiz) => number> = {
    newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
    title: (a, b) => a.title.localeCompare(b.title) || a.id - b.id,
};

const toSummary = (quiz: Quiz): QuizSummary => ({
    id: quiz.id,
    title: quiz.title,
    topic: quiz.topic,
    sourceName: quiz.sourceName,
    questionCount: quiz.questions.length,
    createdAt: quiz.createdAt,
});

/**
 * A genuine implementation of the QuizRepository port, not a mock: it honors
 * the same contract as the Prisma implementation — auto-incrementing ids for
 * quizzes, questions and options, the same sort orders, and cursor semantics
 * that resume after the row the cursor names.
 */
export const createInMemoryQuizRepository = (
    clock: Clock = systemClock,
): QuizRepository & { rows: () => Quiz[] } => {
    let nextQuizId = 1;
    let nextQuestionId = 1;
    let nextOptionId = 1;
    let rows: Quiz[] = [];

    const materialize = (question: NewQuestion): Question => ({
        id: nextQuestionId++,
        position: question.position,
        kind: question.kind,
        prompt: question.prompt,
        explanation: question.explanation,
        options: question.options.map((option) => ({
            id: nextOptionId++,
            text: option.text,
            isCorrect: option.isCorrect,
        })),
    });

    return {
        rows: () => [...rows],

        create: async (data) => {
            const quiz: Quiz = {
                id: nextQuizId++,
                articleId: data.articleId,
                title: data.title,
                topic: data.topic,
                sourceName: data.sourceName,
                questions: data.questions.map(materialize),
                createdAt: clock.now(),
            };

            rows = [...rows, quiz];

            return quiz;
        },

        findById: async (id) => rows.find((quiz) => quiz.id === id) ?? null,

        save: async (quiz) => {
            if (!rows.some((row) => row.id === quiz.id)) {
                throw new QuizNotFoundError();
            }

            rows = rows.map((row) => (row.id === quiz.id ? quiz : row));

            return quiz;
        },

        remove: async (id) => {
            if (!rows.some((quiz) => quiz.id === id)) {
                throw new QuizNotFoundError();
            }

            rows = rows.filter((quiz) => quiz.id !== id);
        },

        list: async ({ limit, cursor, search, sort }) => {
            const ordered = rows
                .filter((quiz) => matchesSearch(quiz, search))
                .sort(COMPARE[sort]);

            const start =
                cursor === undefined
                    ? 0
                    : ordered.findIndex((quiz) => quiz.id === cursor) + 1;

            return pageOf(ordered.slice(start), limit, toSummary);
        },

        listTopics: async () => [...new Set(rows.map((quiz) => quiz.topic))].sort(),
    };
};
