/**
 * Migración para actualizar usuarios freemium existentes a 5 búsquedas
 * 
 * Ejecutar con: npx ts-node prisma/migrations/update-freemium-uses.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Actualizando usuarios freemium existentes a 5 búsquedas...');

    // Buscar usuarios freemium activos
    const result = await prisma.subscription.updateMany({
        where: {
            plan: 'FREEMIUM',
            freemiumExpired: false,
        },
        data: {
            freemiumUsesLeft: 5,
            freemiumStartDate: new Date(), // Resetear fecha de inicio
        },
    });

    console.log(`✅ ${result.count} suscripciones freemium actualizadas a 5 búsquedas (fecha reseteada)`);
}

main()
    .catch((e) => {
        console.error('❌ Error en migración:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
