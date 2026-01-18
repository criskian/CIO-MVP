-- CreateTable
CREATE TABLE "pending_job_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobs" JSONB NOT NULL,
    "jobCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "pending_job_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_job_alerts_userId_viewedAt_idx" ON "pending_job_alerts"("userId", "viewedAt");

-- AddForeignKey
ALTER TABLE "pending_job_alerts" ADD CONSTRAINT "pending_job_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
