import type { CreateQuizInput } from "./service.port.js";

export type CreatedQuizRef = {
    id: number;
    title: string;
    topic: string;
};

export type QuizPublicApi = {
    createQuiz: (input: CreateQuizInput) => Promise<CreatedQuizRef>;
    listTopics: () => Promise<string[]>;
};
