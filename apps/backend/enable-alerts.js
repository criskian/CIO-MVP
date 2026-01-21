const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function enableAlerts() {
    const userId = 'cmkl7xsvr001zn5k44pbekgg5';

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
