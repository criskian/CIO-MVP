# CIO Admin Panel

Panel de administración para CIO (Cazador Inteligente de Ofertas) by Almia.

## 🚀 Desarrollo

### Pre-requisitos

- Node.js 18+
- Backend CIO corriendo en `http://localhost:3001`

### Instalación

```bash
cd apps/admin
npm install
```

### Variables de Entorno

Crear archivo `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Para producción:
```env
NEXT_PUBLIC_API_URL=https://api-cio-backend.onrender.com
```

### Ejecutar en desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3002`

### Construir para producción

```bash
npm run build
npm start
```

## 🎨 Características

- ✅ Autenticación con JWT
- ✅ Gestión de usuarios
- ✅ Administración de suscripciones
- ✅ Dashboard con estadísticas
- ✅ Diseño con colores de Almia
- ✅ Responsive design

## 🔐 Acceso

Para crear el primer admin, ejecuta el seed del backend:

```bash
cd apps/backend
ADMIN_EMAIL=admin@almia.com.co ADMIN_PASSWORD=tu_password npm run seed
```

Luego ingresa con esas credenciales en `/login`

## 🏗️ Estructura

```
src/
├── app/              # Páginas de Next.js (App Router)
│   ├── login/       # Página de login
│   └── dashboard/   # Dashboard y sub-páginas
├── components/       # Componentes React
│   ├── ui/          # Componentes base
│   ├── layout/      # Layout components
│   └── tables/      # Tablas de datos
├── lib/             # Utilidades
│   ├── api.ts       # Cliente API
│   ├── auth.ts      # Funciones de auth
│   └── utils.ts     # Helpers
└── types/           # TypeScript types
```

## 🚢 Despliegue

### Render

1. Crear nuevo Static Site
2. Root Directory: `apps/admin`
3. Build Command: `npm run build`
4. Publish Directory: `.next`
5. Variables de entorno: `NEXT_PUBLIC_API_URL`
6. Custom Domain: `api.cio.almia.com.co`

## 📝 Licencia

© 2025 Almia Consulting SAS

