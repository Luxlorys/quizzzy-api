import type { Quiz } from "../quiz.entity.js";

export type QuizCache = {
    read: (id: number) => Promise<Quiz | null>;
    write: (quiz: Quiz) => Promise<void>;
    forget: (id: number) => Promise<void>;
};
