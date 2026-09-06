-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "quiz_generations" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'pending',
    "lock_token" TEXT NOT NULL,
    "quiz_id" INTEGER,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cache_read_tokens" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "quiz_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quiz_generations_status_idx" ON "quiz_generations"("status");

-- CreateIndex
CREATE INDEX "quiz_generations_created_at_id_idx" ON "quiz_generations"("created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "quiz_generations" ADD CONSTRAINT "quiz_generations_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_generations" ADD CONSTRAINT "quiz_generations_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
