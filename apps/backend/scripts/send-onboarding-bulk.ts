/**
 * Script: send-onboarding-bulk.ts
 * 
 * Fetches the last 80 users registered before Feb 20, 2026 (with email defined),
 * and sends them the onboarding email template.
 * 
 * Run from apps/backend:
 *   npx ts-node -r tsconfig-paths/register scripts/send-onboarding-bulk.ts
 * 
 * Dry-run (show list without sending):
 *   DRY_RUN=true npx ts-node -r tsconfig-paths/register scripts/send-onboarding-bulk.ts
 */

import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

const DRY_RUN = process.env.DRY_RUN === 'true';
const BACKEND_URL = process.env.NODE_ENV === 'production'
    ? 'https://api.cio.almia.com.co'
    : 'http://localhost:3001';

const CUTOFF_DATE = new Date('2026-02-20T00:00:00.000-05:00'); // Feb 19 backwards (COL timezone)
const LIMIT = 80;
const DELAY_MS = 500; // 500ms between emails to avoid rate limits

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getOnboardingHtml(name: string, backendUrl: string): string {
    const displayName = name || 'usuario';
    // Import and call the same HTML generator from the notifications service
    // For standalone usage, we inline the API call to our own preview endpoint
    return `<!-- Rendered via API -->`;
}

async function main() {
    console.log('🔍 Buscando los últimos', LIMIT, 'usuarios registrados antes del 20 de febrero...');
    console.log('📅 Fecha límite:', CUTOFF_DATE.toISOString());
    if (DRY_RUN) {
        console.log('⚠️  MODO DRY RUN — No se enviarán correos reales\n');
    }

    const users = await prisma.user.findMany({
        where: {
            createdAt: {
                lt: CUTOFF_DATE,
            },
            email: {
                not: null,
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
        take: LIMIT,
        select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
        },
    });

    console.log(`✅ Encontrados ${users.length} usuarios con email registrados antes del 20/02/2026\n`);

    if (users.length === 0) {
        console.log('⚠️  No hay usuarios que cumplan los criterios. Saliendo.');
        return;
    }

    // Show list
    console.log('─'.repeat(70));
    users.forEach((u, i) => {
        console.log(
            `${String(i + 1).padStart(3)}. ${u.email?.padEnd(35)} | ${u.name?.padEnd(20) || '(sin nombre)'.padEnd(20)} | ${u.createdAt.toLocaleDateString('es-CO')}`
        );
    });
    console.log('─'.repeat(70));
    console.log();

    if (DRY_RUN) {
        console.log('✅ Dry run completado. Se enviarían', users.length, 'correos.');
        return;
    }

    console.log('📧 Iniciando envío de correos...\n');

    let sent = 0;
    let failed = 0;
    const errors: { email: string; error: string }[] = [];

    for (const user of users) {
        if (!user.email) continue;

        try {
            // Fetch the rendered HTML from our own preview endpoint (production)
            const htmlRes = await fetch(`${BACKEND_URL}/notifications/preview-onboarding`);
            let html = await htmlRes.text();

            // Replace generic "Hola," with personalized greeting if name exists
            if (user.name) {
                html = html.replace(
                    '<p style="margin: 0 0 4px 0; font-size: 15px; color: #222222;">Hola,</p>',
                    `<p style="margin: 0 0 4px 0; font-size: 15px; color: #222222;">Hola, <strong>${user.name}</strong>,</p>`
                );
            }

            await resend.emails.send({
                from: 'CIO by Almia <noreply@almia.com.co>',
                to: user.email,
                subject: '🚀 ¡Ya puedes configurar tu búsqueda inteligente en CIO!',
                html,
            });

            sent++;
            console.log(`✅ [${sent + failed}/${users.length}] Enviado a: ${user.email}`);
        } catch (err: any) {
            failed++;
            const errorMsg = err?.message || String(err);
            errors.push({ email: user.email, error: errorMsg });
            console.error(`❌ [${sent + failed}/${users.length}] Error con ${user.email}: ${errorMsg}`);
        }

        // Rate limit safety delay
        await sleep(DELAY_MS);
    }

    console.log('\n' + '═'.repeat(70));
    console.log(`📊 RESUMEN:`);
    console.log(`   ✅ Enviados exitosamente: ${sent}`);
    console.log(`   ❌ Fallidos:              ${failed}`);
    console.log('═'.repeat(70));

    if (errors.length > 0) {
        console.log('\n⚠️  Correos con error:');
        errors.forEach(e => console.log(`   • ${e.email}: ${e.error}`));
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
