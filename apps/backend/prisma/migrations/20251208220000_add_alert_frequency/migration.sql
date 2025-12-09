-- AlterTable
ALTER TABLE "alert_preferences" ADD COLUMN IF NOT EXISTS "alertFrequency" TEXT NOT NULL DEFAULT 'daily';

-- UpdateData: establecer frecuencia diaria por defecto para registros existentes
UPDATE "alert_preferences" SET "alertFrequency" = 'daily' WHERE "alertFrequency" IS NULL;

