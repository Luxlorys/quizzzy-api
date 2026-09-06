import { toGenerationDto } from "./generation.dto.js";
import { reconcileTopic } from "./generation.entity.js";
import {
    ArticleTooLargeError,
    EmptyArticleTextError,
    GenerationInProgressError,
    GenerationInvalidOutputError,
    GenerationLockUnavailableError,
    GenerationNotFoundError,
    GenerationOutputTruncatedError,
    GenerationRefusedError,
    GenerationUnavailableError,
    LockLostError,
} from "./generation.errors.js";
import type { Generation } from "./generation.entity.js";
import type {
    GenerationService,
    GenerationServiceDeps,
    GenerationServiceOptions,
} from "./ports/service.port.js";

const MILLISECONDS_PER_SECOND = 1000;
const ARTICLE_SOURCE_MISSING_ERROR_NAME = "ArticleSourceMissingError";

type Failure = {
    code: string;
    message: string;
};

const isNamed = (error: unknown, name: string): error is Error =>
    error instanceof Error && error.name === name;

const toFailure = (error: unknown): Failure => {
    if (isNamed(error, ARTICLE_SOURCE_MISSING_ERROR_NAME)) {
        return { code: "ARTICLE_SOURCE_MISSING", message: error.message };
    }

    if (error instanceof ArticleTooLargeError) {
        return { code: "ARTICLE_TOO_LARGE", message: error.message };
    }

    if (error instanceof EmptyArticleTextError) {
        return { code: "EMPTY_ARTICLE_TEXT", message: error.message };
    }

    if (error instanceof GenerationRefusedError) {
        return { code: "GENERATION_REFUSED", message: error.message };
    }

    if (error instanceof GenerationOutputTruncatedError) {
        return { code: "GENERATION_OUTPUT_TRUNCATED", message: error.message };
    }

    if (error instanceof GenerationUnavailableError) {
        return { code: "GENERATION_UNAVAILABLE", message: error.message };
    }

    if (error instanceof LockLostError) {
        return { code: "LOCK_LOST", message: error.message };
    }

    if (error instanceof GenerationInvalidOutputError) {
        return { code: "GENERATION_INVALID_OUTPUT", message: error.message };
    }

    const fallback = new GenerationInvalidOutputError();

    return { code: "GENERATION_INVALID_OUTPUT", message: fallback.message };
};

export const createGenerationService = (
    {
        repository,
        lock,
        generator,
        articles,
        quizzes,
        clock,
        tokens,
    }: GenerationServiceDeps,
    { lockRenewSeconds }: GenerationServiceOptions,
): GenerationService => {
    const loadGeneration = async (id: number): Promise<Generation> => {
        const generation = await repository.findById(id);

        if (generation === null) {
            throw new GenerationNotFoundError();
        }

        return generation;
    };

    const runGeneration = async (
        generation: Generation,
        token: string,
    ): Promise<void> => {
        const heartbeatState = { lockLost: false };

        const heartbeat = setInterval(() => {
            lock.renew(token)
                .then((renewed) => {
                    if (!renewed) {
                        heartbeatState.lockLost = true;
                    }
                })
                .catch(() => {
                    heartbeatState.lockLost = true;
                });
        }, lockRenewSeconds * MILLISECONDS_PER_SECOND);

        try {
            const running = await repository.save({
                ...generation,
                status: "running",
            });

            const [source, knownTopics] = await Promise.all([
                articles.readArticleSource(running.articleId),
                quizzes.listTopics(),
            ]);

            const { candidate, usage } = await generator.generate({
                articleHtml: source.html,
                filename: source.filename,
                knownTopics,
            });

            if (heartbeatState.lockLost) {
                throw new LockLostError();
            }

            const reconciled = reconcileTopic(candidate.topic, knownTopics);

            const createdQuiz = await quizzes.createQuiz({
                articleId: running.articleId,
                title: candidate.title,
                topic: reconciled.topic,
                questions: candidate.questions,
            });

            await repository
                .save({
                    ...running,
                    status: "succeeded",
                    quizId: createdQuiz.id,
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    cacheReadTokens: usage.cacheReadTokens,
                    finishedAt: clock.now(),
                })
                .catch(() => undefined);
        } catch (error) {
            const failure = toFailure(error);

            await repository
                .save({
                    ...generation,
                    status: "failed",
                    failureCode: failure.code,
                    failureMessage: failure.message,
                    finishedAt: clock.now(),
                })
                .catch(() => undefined);
        } finally {
            clearInterval(heartbeat);
            await lock.release(token).catch(() => undefined);
        }
    };

    return {
        startGeneration: async ({ articleId }) => {
            const article = await articles.getArticle(articleId);
            const token = tokens.generate();

            let acquired: boolean;

            try {
                acquired = await lock.acquire(token);
            } catch {
                throw new GenerationLockUnavailableError();
            }

            if (!acquired) {
                throw new GenerationInProgressError();
            }

            let generation: Generation;

            try {
                generation = await repository.create({
                    articleId: article.id,
                    lockToken: token,
                });
            } catch (error) {
                await lock.release(token).catch(() => undefined);

                throw error;
            }

            void runGeneration(generation, token);

            return toGenerationDto(generation);
        },

        getActiveGeneration: async () => {
            const active = await repository.findActive();

            return active === null ? null : toGenerationDto(active);
        },

        getGeneration: async (id) => toGenerationDto(await loadGeneration(id)),

        reconcileOnBoot: async () => {
            const holder = await lock.holder().catch(() => null);

            await repository.failUnfinished(clock.now(), holder);
        },
    };
};
