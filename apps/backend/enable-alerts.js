const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function enableAlerts() {
    const userId = 'cmjpx4sd000bo7e1c1mb4jcoz';

    const updated = await prisma.alertPreference.update({
        where: { userId },
        data: { enabled: true }
    });

    console.log('UPDATED - ENABLED:', updated.enabled);
    console.log('FREQUENCY:', updated.alertFrequency);
    console.log('TIME:', updated.alertTimeLocal);

    await prisma.$disconnect();
}

enableAlerts().catch(console.error);
