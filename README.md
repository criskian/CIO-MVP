# 🎯 CIO - Cazador Inteligente de Oportunidades

**Bot conversacional en WhatsApp para búsqueda automatizada de empleo en Colombia**

## 📋 Descripción

CIO es un agente conversacional que ayuda a las personas a encontrar empleo de forma automatizada a través de WhatsApp. Construye un perfil personalizado del usuario y envía alertas diarias con las mejores ofertas de empleo usando Google Custom Search.

## 🏗️ Arquitectura del Proyecto

Este es un monorepo organizado con:

```
cio-mvp/
├── apps/
│   ├── landing/         # Frontend Next.js - Landing page
│   ├── backend/         # Backend NestJS - API y lógica de negocio
│   └── cv-service/      # Microservicio Python - Procesamiento de CVs
├── packages/
│   └── shared/          # Tipos e interfaces compartidos (opcional)
└── ...
```

### Stack Tecnológico

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: NestJS + TypeScript + Node.js >=18
- **Base de datos**: PostgreSQL + Prisma ORM
- **CV Processing**: Python + FastAPI + pdfplumber
- **Job Search**: Google Custom Search JSON API
- **LLM**: OpenAI API (GPT-4)
- **Scheduler**: node-cron
- **Messaging**: WhatsApp Cloud API / Twilio

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js >= 18
- npm >= 9
- PostgreSQL (local o gestionado)
- Python >= 3.9 (para cv-service)
- Cuentas en:
  - WhatsApp Cloud API o Twilio
  - Google Cloud (Custom Search API)
  - OpenAI

### Instalación

Ver archivo `SETUP.md` para instrucciones detalladas de instalación.

## 📁 Módulos del Backend (NestJS)

1. **WhatsappModule**: Adapter para WhatsApp (Cloud API / Twilio)
2. **ConversationModule**: Orchestrador con state machine del flujo conversacional
3. **JobSearchModule**: Integración con Google Custom Search + ranking de ofertas
4. **SchedulerModule**: Alertas diarias programadas con node-cron
5. **LlmModule**: Cliente centralizado para OpenAI
6. **DatabaseModule**: Configuración de Prisma
7. **CvModule**: Orquestador para procesamiento de CVs

## 🔄 Flujo del Usuario

1. Usuario accede a la landing web
2. Hace clic en "Hablar con CIO en WhatsApp"
3. CIO realiza onboarding (rol, ubicación, salario, tipo de jornada, hora de alertas)
4. CIO busca ofertas personalizadas en Google
5. Usuario recibe alertas diarias automáticas

## 🗃️ Modelo de Datos (Prisma)

- `User`: Datos básicos del usuario (phone)
- `UserProfile`: Perfil de búsqueda (rol, ubicación, salario, etc.)
- `Session`: Estado de conversación (state machine)
- `AlertPreference`: Configuración de alertas diarias
- `JobSearchLog`: Historial de búsquedas
- `SentJob`: Ofertas enviadas (evita duplicados)

## 🌍 Localización

- Sistema localizado para **Colombia** 🇨🇴
- Conversaciones en **español**
- Zona horaria: America/Bogota

## 📝 Estado del Proyecto

**MVP en desarrollo** - Estructura base lista para implementación

## 📄 Licencia

MIT

---

**Nota**: Los archivos `instrucciones.md` y `roadmap.md` contienen documentación interna detallada y no se suben al repositorio.
