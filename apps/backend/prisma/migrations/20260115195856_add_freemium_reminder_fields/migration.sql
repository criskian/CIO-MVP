-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "freemiumExpiredSentAt" TIMESTAMP(3),
ADD COLUMN     "freemiumReminderSent" BOOLEAN NOT NULL DEFAULT false;
