import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...\n');

  // SEGURIDAD: Solo permitir crear admin si no existe ninguno
  const adminCount = await prisma.adminUser.count();
  
  if (adminCount > 0) {
    console.error('🔒 SEGURIDAD: Ya existe al menos un admin en la base de datos.');
    console.error('   Por razones de seguridad, el seed solo puede ejecutarse cuando NO hay admins.');
    console.error('   Si necesitas crear más admins, usa la base de datos directamente o crea un endpoint protegido.\n');
    console.error(`   Admins actuales: ${adminCount}\n`);
    process.exit(1);
  }

  // Obtener credenciales del admin desde variables de entorno
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || 'Super Admin';
  const masterKey = process.env.SEED_MASTER_KEY;

  if (!adminEmail || !adminPassword) {
    console.error('❌ ERROR: Debes proporcionar ADMIN_EMAIL y ADMIN_PASSWORD en las variables de entorno');
    console.error('Ejemplo de uso:');
    console.error('  ADMIN_EMAIL=admin@almia.com.co ADMIN_PASSWORD=tu_password_seguro SEED_MASTER_KEY=tu_master_key npm run seed');
    process.exit(1);
  }

  // Validación adicional con master key (opcional pero recomendado)
  const requiredMasterKey = process.env.SEED_MASTER_KEY_REQUIRED;
  if (requiredMasterKey) {
    if (!masterKey || masterKey !== requiredMasterKey) {
      console.error('🔒 ERROR: SEED_MASTER_KEY inválida o no proporcionada.');
      console.error('   Esta es una protección adicional para evitar creación no autorizada de admins.');
      process.exit(1);
    }
  }


  // Hashear la contraseña
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // Crear el admin
  const admin = await prisma.adminUser.create({
    data: {
      email: adminEmail,
      passwordHash,
      name: adminName,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('✅ Admin creado exitosamente:');
  console.log(`   Email: ${admin.email}`);
  console.log(`   Nombre: ${admin.name}`);
  console.log(`   Role: ${admin.role}`);
  console.log(`   ID: ${admin.id}\n`);

  console.log('🔐 Puedes hacer login en:');
  console.log('   POST /api/admin/auth/login');
  console.log('   Body: { "email": "' + admin.email + '", "password": "tu_password" }\n');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

