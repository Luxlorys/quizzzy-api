import {
    assertSubmitted,
    draftQuiz,
    gradeAnswers,
    recordProgress,
    renameQuiz,
    startAttempt,
    submitAttempt,
} from "./quiz.entity.js";
import { toAttemptResultDto } from "./dto/attempt-result.dto.js";
import { toAttemptDto } from "./dto/attempt.dto.js";
import { toQuizPageDto } from "./dto/quiz-list-item.dto.js";
import { toQuizDto } from "./dto/quiz.dto.js";
import { AttemptNotFoundError, QuizNotFoundError } from "./quiz.errors.js";
import type { Attempt, Quiz } from "./quiz.entity.js";
import type { QuizService, QuizServiceDeps } from "./ports/service.port.js";

export const createQuizService = ({
    repository,
    attempts,
    cache,
    articles,
    clock,
}: QuizServiceDeps): QuizService => {
    const orNotFound = (quiz: Quiz | null): Quiz => {
        if (quiz === null) {
            throw new QuizNotFoundError();
        }

        return quiz;
    };

    const readQuizCached = async (id: number): Promise<Quiz> => {
        const cached = await cache.read(id);

        if (cached !== null) {
            return cached;
        }

        const quiz = orNotFound(await repository.findById(id));

        await cache.write(quiz);

        return quiz;
    };

    const readQuizFresh = async (id: number): Promise<Quiz> =>
        orNotFound(await repository.findById(id));

    const persist = async (quiz: Quiz): Promise<Quiz> => {
        const saved = await repository.save(quiz);

        await cache.forget(saved.id);

        return saved;
    };

    const loadAttempt = async (id: number): Promise<Attempt> => {
        const attempt = await attempts.findById(id);

        if (attempt === null) {
            throw new AttemptNotFoundError();
        }

        return attempt;
    };

    const resultOf = async (attempt: Attempt) => {
        const quiz = await readQuizFresh(attempt.quizId);

        return toAttemptResultDto(
            attempt,
            quiz,
            gradeAnswers(quiz, attempt.answers),
        );
    };

    return {
        createQuiz: async (input) => {
            const article = await articles.getArticle(input.articleId);

            const quiz = await repository.create(
                draftQuiz({ ...input, sourceName: article.filename }),
            );

            return toQuizDto(quiz);
        },

        getQuiz: async (id) => toQuizDto(await readQuizCached(id)),

        listQuizzes: async (input) => {
            const page = await repository.list(input);

            const latest = await attempts.findLatestForQuizzes(
                page.items.map((summary) => summary.id),
            );

            return toQuizPageDto(page, latest);
        },

        listTopics: () => repository.listTopics(),

        updateQuiz: async (input) =>
            toQuizDto(
                await persist(renameQuiz(await readQuizFresh(input.id), input)),
            ),

        deleteQuiz: async (id) => {
            await repository.remove(id);
            await cache.forget(id);
        },

        startAttempt: async ({ quizId }) => {
            const quiz = await readQuizFresh(quizId);

            return toAttemptDto(
                await attempts.create(startAttempt(quiz, clock.now())),
            );
        },

        getAttempt: async (id) => toAttemptDto(await loadAttempt(id)),

        saveProgress: async ({ id, currentIndex, answers }) => {
            const attempt = await loadAttempt(id);
            const quiz = await readQuizFresh(attempt.quizId);

            return toAttemptDto(
                await attempts.save(
                    recordProgress(attempt, quiz, { currentIndex, answers }),
                ),
            );
        },

        submitAttempt: async ({ id, answers }) => {
            const attempt = await loadAttempt(id);
            const quiz = await readQuizFresh(attempt.quizId);

            const submitted = await attempts.save(
                submitAttempt(attempt, quiz, answers, clock.now()),
            );

            return toAttemptResultDto(
                submitted,
                quiz,
                gradeAnswers(quiz, submitted.answers),
            );
        },

        getAttemptResult: async (id) => {
            const attempt = await loadAttempt(id);

            assertSubmitted(attempt);

            return resultOf(attempt);
        },
    };
};
