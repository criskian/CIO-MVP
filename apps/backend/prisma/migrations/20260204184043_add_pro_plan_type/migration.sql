-- AlterEnum
ALTER TYPE "PlanType" ADD VALUE 'PRO';

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "freemiumUsesLeft" SET DEFAULT 5;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "planType" "PlanType" NOT NULL DEFAULT 'PREMIUM';
