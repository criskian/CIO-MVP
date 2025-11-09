# 📦 Guía de Instalación y Setup - CIO MVP

Esta guía te llevará paso a paso para configurar todo el entorno de desarrollo.

## 1️⃣ Clonar el Repositorio (si ya existe)

```bash
git clone <tu-repo-url>
cd cio-mvp
```

## 2️⃣ Instalar Dependencias del Monorepo

```bash
# Instalar todas las dependencias del workspace
npm install
```

Esto instalará las dependencias de:
- Raíz del proyecto
- `apps/landing`
- `apps/backend`
- `packages/shared`

## 3️⃣ Configurar Variables de Entorno

### Backend (apps/backend)

Crea un archivo `.env` en `apps/backend/`:

```bash
cd apps/backend
cp ../../.env.example .env
```

Edita el archivo `.env` con tus credenciales reales:

```env
NODE_ENV=development
PORT=3001

# PostgreSQL - Ajusta según tu configuración
DATABASE_URL=postgresql://user:password@localhost:5432/cio_mvp?schema=public

# WhatsApp (elige uno)
WHATSAPP_PROVIDER=cloud_api
WHATSAPP_PHONE_ID=tu_phone_id
WHATSAPP_TOKEN=tu_token
WHATSAPP_VERIFY_TOKEN=mi_token_secreto_123

# Google Custom Search
GOOGLE_CSE_API_KEY=tu_api_key
GOOGLE_CSE_CX=tu_search_engine_id

# OpenAI
OPENAI_API_KEY=tu_openai_key
OPENAI_MODEL=gpt-4
```

### Landing (apps/landing)

Crea un archivo `.env.local` en `apps/landing/`:

```bash
cd ../landing
touch .env.local
```

Contenido:

```env
NEXT_PUBLIC_WHATSAPP_NUMBER=573001234567
```

## 4️⃣ Configurar Base de Datos

### Opción A: PostgreSQL Local

```bash
# Instalar PostgreSQL si no lo tienes
# Windows: https://www.postgresql.org/download/windows/
# Mac: brew install postgresql

# Crear la base de datos
psql -U postgres
CREATE DATABASE cio_mvp;
\q
```

### Opción B: PostgreSQL Gestionado (Recomendado)

Puedes usar:
- [Supabase](https://supabase.com/) (Gratis, fácil)
- [Railway](https://railway.app/)
- [Neon](https://neon.tech/)

Copia la URL de conexión y pégala en `DATABASE_URL` en tu `.env`.

### Generar Cliente de Prisma y Ejecutar Migraciones

```bash
cd apps/backend

# Generar el cliente de Prisma
npm run prisma:generate

# Ejecutar migraciones (crear tablas)
npm run prisma:migrate

# Ver la base de datos (opcional)
npm run prisma:studio
```

## 5️⃣ Configurar Python (CV Service) - Opcional para MVP

```bash
cd apps/cv-service

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Crear archivo .env
cp .env.example .env
# Editar .env con tus valores
```

## 6️⃣ Instalar Dependencias Adicionales de Next.js

```bash
cd apps/landing

# Instalar Tailwind CSS y sus dependencias
npm install -D tailwindcss postcss autoprefixer
```

## 7️⃣ Ejecutar el Proyecto en Desarrollo

### Terminal 1: Backend (NestJS)

```bash
cd apps/backend
npm run start:dev
```

El backend estará en: `http://localhost:3001`

### Terminal 2: Landing (Next.js)

```bash
cd apps/landing
npm run dev
```

La landing estará en: `http://localhost:3000`

### Terminal 3: CV Service (Python) - Opcional

```bash
cd apps/cv-service
venv\Scripts\activate  # o source venv/bin/activate en Mac/Linux
python main.py
```

El servicio estará en: `http://localhost:8000`

## 8️⃣ Configurar Webhook de WhatsApp

### WhatsApp Cloud API

1. Ve a [Meta for Developers](https://developers.facebook.com/)
2. Crea una app de tipo "Business"
3. Añade el producto "WhatsApp"
4. En "Configuration", añade la URL de tu webhook:
   - Webhook URL: `https://tu-dominio.com/webhook/whatsapp`
   - Verify Token: el mismo que pusiste en `WHATSAPP_VERIFY_TOKEN`

Para desarrollo local, usa [ngrok](https://ngrok.com/) para exponer tu puerto 3001:

```bash
ngrok http 3001
# Copia la URL https que te da (ej: https://abc123.ngrok.io)
# Webhook URL: https://abc123.ngrok.io/webhook/whatsapp
```

### Twilio (alternativa)

1. Ve a [Twilio Console](https://console.twilio.com/)
2. Configura WhatsApp Sandbox
3. Sigue las instrucciones para conectar tu webhook

## 9️⃣ Configurar Google Custom Search

1. Ve a [Google Programmable Search Engine](https://programmablesearchengine.google.com/)
2. Crea un nuevo motor de búsqueda
3. Configúralo para buscar en toda la web
4. Habilita "Search the entire web"
5. Obtén tu `Search Engine ID (cx)`

6. Ve a [Google Cloud Console](https://console.cloud.google.com/)
7. Habilita "Custom Search API"
8. Crea credenciales (API Key)
9. Copia el API Key

Añade ambos valores a tu `.env` del backend.

## 🔟 Verificar que Todo Funciona

### Backend

```bash
curl http://localhost:3001/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=mi_token_secreto_123&hub.challenge=test123
```

Debería devolver: `test123`

### Landing

Abre `http://localhost:3000` en tu navegador. Deberías ver la landing page de CIO.

### Base de Datos

```bash
cd apps/backend
npm run prisma:studio
```

Se abrirá una interfaz web para ver tus tablas.

## 📚 Comandos Útiles

### Monorepo (desde raíz)

```bash
# Desarrollo
npm run dev:landing      # Iniciar landing
npm run dev:backend      # Iniciar backend

# Build
npm run build:landing
npm run build:backend

# Prisma
npm run prisma:generate  # Generar cliente
npm run prisma:migrate   # Ejecutar migraciones
npm run prisma:studio    # Abrir Prisma Studio
```

### Backend Individual

```bash
cd apps/backend

npm run start:dev        # Desarrollo con hot-reload
npm run build            # Build para producción
npm run start:prod       # Ejecutar build de producción
npm run lint             # Linter
```

### Landing Individual

```bash
cd apps/landing

npm run dev              # Desarrollo
npm run build            # Build para producción
npm run start            # Ejecutar build de producción
npm run lint             # Linter
```

## 🐛 Problemas Comunes

### Error de conexión a PostgreSQL

- Verifica que PostgreSQL esté corriendo
- Revisa que la URL de conexión sea correcta
- Asegúrate de que la base de datos existe

### Error de módulos no encontrados

```bash
# Borrar node_modules y reinstalar
rm -rf node_modules package-lock.json
npm install
```

### Prisma no genera los tipos

```bash
cd apps/backend
npx prisma generate
```

### Error de puertos en uso

```bash
# Windows: ver qué está usando el puerto
netstat -ano | findstr :3001

# Mac/Linux
lsof -i :3001
```

## ✅ Siguiente Paso

Una vez que todo esté funcionando, estás listo para comenzar la implementación según el roadmap definido. Revisa los archivos:
- `apps/backend/src/app.module.ts` - Punto de entrada del backend
- `apps/landing/src/app/page.tsx` - Landing page
- `apps/backend/prisma/schema.prisma` - Modelo de datos

¡Listo para comenzar el desarrollo! 🚀

