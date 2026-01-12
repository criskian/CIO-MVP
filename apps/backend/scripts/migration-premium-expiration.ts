/**
 * Script de Migración: Establecer premiumEndDate para usuarios premium existentes
 * 
 * Ejecutar con: npx ts-node scripts/migration-premium-expiration.ts
 * O desde el directorio backend: npm run migration:premium-expiration
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migratePremiumUsers() {
    console.log('🚀 Iniciando migración de usuarios premium...\n');

    // Obtener todos los usuarios premium activos SIN premiumEndDate
    const premiumSubscriptions = await prisma.subscription.findMany({
        where: {
            plan: 'PREMIUM',
            status: 'ACTIVE',
            premiumEndDate: null,
        },
        include: {
            user: {
                select: { phone: true, name: true },
            },
        },
    });

    console.log(`📊 Encontrados ${premiumSubscriptions.length} usuarios premium sin fecha de expiración\n`);

    if (premiumSubscriptions.length === 0) {
        console.log('✅ No hay usuarios que migrar');
        return;
    }

    let migratedCount = 0;
    let errorCount = 0;

    for (const subscription of premiumSubscriptions) {
        try {
            // Calcular premiumEndDate: 30 días desde premiumStartDate
            const premiumStartDate = subscription.premiumStartDate || new Date();
            const premiumEndDate = new Date(premiumStartDate.getTime() + 30 * 24 * 60 * 60 * 1000);

            // También actualizar premiumWeekStart si usa formato calendario
            const premiumWeekStart = subscription.premiumWeekStart || premiumStartDate;

            await prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    premiumEndDate,
                    premiumWeekStart,
                },
            });

            console.log(`✅ ${subscription.user?.phone || subscription.userId}: premiumEndDate = ${premiumEndDate.toISOString()}`);
            migratedCount++;
        } catch (error) {
            console.error(`❌ Error migrando ${subscription.userId}:`, error);
            errorCount++;
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`📈 Resumen de migración:`);
    console.log(`   ✅ Migrados: ${migratedCount}`);
    console.log(`   ❌ Errores: ${errorCount}`);
    console.log(`${'='.repeat(50)}\n`);
}

async function main() {
    try {
        await migratePremiumUsers();
    } catch (error) {
        console.error('Error en migración:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
