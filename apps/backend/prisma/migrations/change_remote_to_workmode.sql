-- Migración: Cambiar remoteAllowed (Boolean) a workMode (String)
-- Ejecutar este script en Supabase SQL Editor

-- 1. Agregar nueva columna workMode
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "workMode" TEXT;

-- 2. Migrar datos existentes de remoteAllowed a workMode
UPDATE "user_profiles" 
SET "workMode" = CASE 
    WHEN "remoteAllowed" = true THEN 'remoto'
    WHEN "remoteAllowed" = false THEN 'presencial'
    ELSE NULL
END
WHERE "workMode" IS NULL;

-- 3. Eliminar columna antigua remoteAllowed
ALTER TABLE "user_profiles" DROP COLUMN IF EXISTS "remoteAllowed";

-- 4. Verificar que todo esté correcto
SELECT "userId", "workMode", "role", "location" FROM "user_profiles" LIMIT 10;

