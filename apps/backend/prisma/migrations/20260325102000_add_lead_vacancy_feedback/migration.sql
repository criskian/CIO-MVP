-- CreateTable
CREATE TABLE "lead_vacancy_feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interested" BOOLEAN NOT NULL,
    "reason" TEXT,
    "reasonText" TEXT,
    "reasonSource" TEXT,
    "confidence" DOUBLE PRECISION,
    "vacancy" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_vacancy_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_vacancy_feedback_userId_createdAt_idx" ON "lead_vacancy_feedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_vacancy_feedback_userId_interested_createdAt_idx" ON "lead_vacancy_feedback"("userId", "interested", "createdAt");

-- AddForeignKey
ALTER TABLE "lead_vacancy_feedback" ADD CONSTRAINT "lead_vacancy_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
