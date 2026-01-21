const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUser() {
    const userId = 'cmkl7xsvr001zn5k44pbekgg5';

    const alertPref = await prisma.alertPreference.findUnique({
        where: { userId }
    });

    if (alertPref) {
        console.log('ENABLED:', alertPref.enabled);
        console.log('FREQUENCY:', alertPref.alertFrequency);
        console.log('TIME:', alertPref.alertTimeLocal);
        console.log('TIMEZONE:', alertPref.timezone);
    } else {
        console.log('NO EXISTE AlertPreference');
    }

    await prisma.$disconnect();
}

checkUser().catch(console.error);
