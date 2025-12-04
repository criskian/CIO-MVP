# 🗺️ ROADMAP COMPLETO: Sistema de Planes (Freemium + Pago)

## 📋 Resumen Ejecutivo

Este documento detalla la implementación completa del sistema de planes para CIO, dividiendo a los usuarios en **Plan Freemium** y **Plan Premium**.

### Cambio Principal respecto al flujo original
Los datos del usuario (nombre, email, teléfono WhatsApp) ahora se capturan **desde la landing page**, no desde el chat de WhatsApp.

### Características del Sistema

| Plan | Límites | Duración |
|------|---------|----------|
| **Freemium** | 3 búsquedas/alertas | 3 días máximo |
| **Premium** | 5 búsquedas/alertas por semana | Según suscripción |

### Reglas de Negocio

1. **Usos se gastan únicamente** con búsqueda o alerta (no con editar perfil, reiniciar, etc.)
2. **Freemium expira** cuando se agotan los 3 usos O pasan 3 días (lo que ocurra primero)
3. **Premium se renueva** semanalmente (lunes a domingo)
4. **Cancelar servicio** elimina preferencias pero **mantiene identidad y suscripción**
5. **No se puede re-registrar** para obtener nueva prueba gratuita

---

## 📊 Flujo de Negocio Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                        LANDING PAGE                              │
│                                                                  │
│  Usuario llena formulario de registro:                          │
│  - Nombre completo                                               │
│  - Email                                                         │
│  - Número de WhatsApp (+57)                                      │
│  - Acepta términos y condiciones                                │
│                                                                  │
│  [Registrarse Gratis]  ←── Crea usuario con plan FREEMIUM       │
│  [Comprar Premium]     ←── Redirige a Wompi, al confirmar       │
│                            pago se activa plan PREMIUM          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      WHATSAPP (CIO)                              │
│                                                                  │
│  Usuario escribe al bot:                                         │
│                                                                  │
│  1. Bot busca usuario por teléfono en BD                         │
│     ├── NO EXISTE → "No estás registrado. Regístrate en [link]" │
│     │                                                            │
│     └── SÍ EXISTE → Verificar suscripción:                      │
│         ├── PREMIUM activo → Bienvenida premium + onboarding    │
│         ├── FREEMIUM activo → Bienvenida free + onboarding      │
│         └── FREEMIUM expirado → Mostrar enlace pago + ASK_EMAIL │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              FLUJO FREEMIUM EXPIRADO                            │
│                                                                  │
│  1. Usuario agota 3 usos o pasan 3 días                         │
│  2. Bot muestra: "Se acabó tu prueba gratuita"                  │
│  3. Bot muestra: enlace de pago Wompi                           │
│  4. Bot pide: "Ingresa el email con el que pagaste"             │
│  5. Usuario ingresa email                                        │
│  6. Bot busca transacción APPROVED con ese email                │
│     ├── ENCONTRADA → Activar Premium + Bienvenida               │
│     └── NO ENCONTRADA → "No encontramos pago, verifica email"   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    WEBHOOK WOMPI                                 │
│                                                                  │
│  Wompi envía evento transaction.updated                         │
│  1. Verificar firma del webhook                                  │
│  2. Guardar transacción en BD                                   │
│  3. Si status = APPROVED y email coincide con usuario           │
│     → Activar Premium automáticamente                           │
│     → Notificar por WhatsApp                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗃️ FASE 1: Base de Datos ✅ (YA IMPLEMENTADA)

### 1.1 Modelo User (Modificado)

**Archivo:** `apps/backend/prisma/schema.prisma`

```prisma
model User {
  id        String   @id @default(cuid())
  phone     String   @unique
  
  // Datos de identidad (se capturan en landing)
  name      String?              // Nombre del usuario
  email     String?  @unique     // Email del usuario
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relaciones existentes
  profile       UserProfile?
  sessions      Session[]
  alert         AlertPreference?
  searchLogs    JobSearchLog[]
  sentJobs      SentJob[]
  
  // Nuevas relaciones para sistema de planes
  subscription  Subscription?
  transactions  Transaction[]

  @@map("users")
}
```

### 1.2 Modelo Subscription (Nuevo)

```prisma
model Subscription {
  id                String             @id @default(cuid())
  userId            String             @unique
  
  // Plan actual
  plan              PlanType           @default(FREEMIUM)
  
  // Control de usos freemium (3 búsquedas O 3 días)
  freemiumUsesLeft  Int                @default(3)
  freemiumStartDate DateTime           @default(now())
  freemiumExpired   Boolean            @default(false)
  
  // Control de usos premium (5 por semana)
  premiumUsesLeft   Int                @default(0)
  premiumWeekStart  DateTime?
  
  // Fechas de suscripción premium
  premiumStartDate  DateTime?
  premiumEndDate    DateTime?          // Null = sin expiración
  
  // Estado de la suscripción
  status            SubscriptionStatus @default(ACTIVE)
  
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("subscriptions")
}

enum PlanType {
  FREEMIUM
  PREMIUM
}

enum SubscriptionStatus {
  ACTIVE
  EXPIRED
  CANCELLED
}
```

### 1.3 Modelo Transaction (Nuevo)

```prisma
model Transaction {
  id              String    @id @default(cuid())
  userId          String?                          // Puede ser null hasta vincular por email
  
  // Datos de Wompi
  wompiId         String    @unique                // ID único de transacción en Wompi
  wompiReference  String                           // Referencia de pago
  wompiStatus     String                           // APPROVED, DECLINED, PENDING, VOIDED, ERROR
  
  // Datos del pago
  amount          Int                              // Monto en centavos (COP)
  currency        String    @default("COP")
  paymentMethod   String?                          // PSE, CARD, NEQUI, BANCOLOMBIA, etc.
  email           String                           // Email usado en el pago
  
  // Vinculación con usuario
  linkedAt        DateTime?                        // Fecha cuando se vinculó al usuario
  
  // Metadata completa de Wompi
  rawPayload      Json?                            // Payload completo del webhook
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user            User?     @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([email])
  @@index([wompiReference])
  @@map("transactions")
}
```

### 1.4 Estado actual

✅ Migración ya aplicada con `npx prisma db push`

---

## 🌐 FASE 2: API de Registro en Backend

### 2.1 Crear módulo de registro

**Crear carpeta:** `apps/backend/src/modules/registration/`

**Archivos a crear:**
- `registration.module.ts`
- `registration.controller.ts`
- `registration.service.ts`
- `dto/register-user.dto.ts`

### 2.2 DTO de registro

**Archivo:** `apps/backend/src/modules/registration/dto/register-user.dto.ts`

```typescript
import { IsEmail, IsNotEmpty, IsString, Matches, MinLength, MaxLength, IsBoolean } from 'class-validator';

export class RegisterUserDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  name: string;

  @IsEmail({}, { message: 'Ingresa un email válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'El número de WhatsApp es requerido' })
  @Matches(/^57\d{10}$/, { 
    message: 'El número debe tener formato colombiano: 57 + 10 dígitos' 
  })
  phone: string;

  @IsBoolean()
  @IsNotEmpty({ message: 'Debes aceptar los términos' })
  acceptedTerms: boolean;
}
```

### 2.3 Controlador de registro

**Archivo:** `apps/backend/src/modules/registration/registration.controller.ts`

```typescript
import { Controller, Post, Body, Get, Param, HttpCode, Logger } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('api/registration')
export class RegistrationController {
  private readonly logger = new Logger(RegistrationController.name);

  constructor(private readonly registrationService: RegistrationService) {}

  /**
   * POST /api/registration/freemium
   * Registra usuario con plan freemium desde la landing
   */
  @Post('freemium')
  @HttpCode(201)
  async registerFreemium(@Body() dto: RegisterUserDto) {
    this.logger.log(`📝 Registro freemium: ${dto.phone}`);
    return this.registrationService.registerFreemiumUser(dto);
  }

  /**
   * GET /api/registration/check/:phone
   * Verifica si un número ya está registrado
   */
  @Get('check/:phone')
  async checkPhone(@Param('phone') phone: string) {
    return this.registrationService.checkPhoneRegistered(phone);
  }

  /**
   * GET /api/registration/check-email/:email
   * Verifica si un email ya está registrado
   */
  @Get('check-email/:email')
  async checkEmail(@Param('email') email: string) {
    return this.registrationService.checkEmailRegistered(email);
  }

  /**
   * GET /api/registration/status/:phone
   * Obtiene el estado de suscripción de un usuario
   */
  @Get('status/:phone')
  async getStatus(@Param('phone') phone: string) {
    return this.registrationService.getUserStatus(phone);
  }
}
```

### 2.4 Servicio de registro

**Archivo:** `apps/backend/src/modules/registration/registration.service.ts`

```typescript
import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RegisterUserDto } from './dto/register-user.dto';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un nuevo usuario con plan freemium
   */
  async registerFreemiumUser(dto: RegisterUserDto) {
    // Verificar si el teléfono ya está registrado
    const existingByPhone = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingByPhone) {
      throw new ConflictException('Este número de WhatsApp ya está registrado');
    }

    // Verificar si el email ya está registrado
    const existingByEmail = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingByEmail) {
      throw new ConflictException('Este email ya está registrado');
    }

    // Crear usuario con suscripción freemium
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        email: dto.email.toLowerCase(),
        subscription: {
          create: {
            plan: 'FREEMIUM',
            freemiumUsesLeft: 3,
            freemiumStartDate: new Date(),
            status: 'ACTIVE',
          },
        },
      },
      include: {
        subscription: true,
      },
    });

    this.logger.log(`✅ Usuario freemium registrado: ${user.phone} - ${user.name}`);

    return {
      success: true,
      message: '¡Registro exitoso! Ya puedes escribir al CIO por WhatsApp.',
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        plan: 'FREEMIUM',
        usesLeft: 3,
      },
    };
  }

  /**
   * Verifica si un número ya está registrado
   */
  async checkPhoneRegistered(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true, name: true },
    });

    return {
      registered: !!user,
      name: user?.name || null,
    };
  }

  /**
   * Verifica si un email ya está registrado
   */
  async checkEmailRegistered(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });

    return {
      registered: !!user,
    };
  }

  /**
   * Obtiene el estado de suscripción de un usuario
   */
  async getUserStatus(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { subscription: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const subscription = user.subscription;

    // Calcular días restantes de freemium
    let freemiumDaysLeft = 0;
    if (subscription && !subscription.freemiumExpired) {
      const daysSinceStart = Math.floor(
        (Date.now() - subscription.freemiumStartDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      freemiumDaysLeft = Math.max(0, 3 - daysSinceStart);
    }

    return {
      registered: true,
      name: user.name,
      email: user.email,
      plan: subscription?.plan || 'NONE',
      status: subscription?.status || 'NONE',
      freemiumExpired: subscription?.freemiumExpired || false,
      freemiumUsesLeft: subscription?.freemiumUsesLeft || 0,
      freemiumDaysLeft,
      premiumUsesLeft: subscription?.premiumUsesLeft || 0,
    };
  }
}
```

### 2.5 Módulo de registro

**Archivo:** `apps/backend/src/modules/registration/registration.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
```

### 2.6 Registrar en app.module.ts

**Archivo:** `apps/backend/src/app.module.ts`

**Agregar:**
```typescript
import { RegistrationModule } from './modules/registration/registration.module';

@Module({
  imports: [
    // ... otros imports existentes ...
    RegistrationModule,
  ],
})
export class AppModule {}
```

### 2.7 Configurar CORS

**Archivo:** `apps/backend/src/main.ts`

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Configurar CORS para permitir requests desde landing
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://cioalmia.vercel.app',
      process.env.CORS_ORIGIN,
    ].filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await app.listen(process.env.PORT || 3001);
}
```

---

## 🎨 FASE 3: Formulario de Registro en Landing

### 3.1 Crear componente de formulario

**Archivo:** `apps/landing/src/components/RegistrationForm.tsx`

```tsx
'use client';

import { useState } from 'react';

interface RegistrationFormProps {
  onSuccess?: () => void;
}

export default function RegistrationForm({ onSuccess }: RegistrationFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    acceptedTerms: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Formatear teléfono (agregar 57 si no lo tiene)
    let phone = formData.phone.replace(/\D/g, '');
    if (!phone.startsWith('57')) {
      phone = '57' + phone;
    }

    try {
      const response = await fetch(`${API_URL}/api/registration/freemium`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          phone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al registrar');
      }

      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <h3 className="text-xl font-bold text-green-800 mb-2">
          ¡Registro exitoso!
        </h3>
        <p className="text-green-700 mb-4">
          Ya puedes escribir al CIO por WhatsApp y comenzar tu búsqueda de empleo.
        </p>
        <a
          href={`https://wa.me/573226906461?text=${encodeURIComponent('Hola CIO, quiero buscar trabajo')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#25D366] text-white font-medium rounded-lg hover:bg-[#128C7E] transition-colors"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
          Ir a WhatsApp
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Nombre completo
        </label>
        <input
          type="text"
          id="name"
          required
          minLength={2}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#9054C6] focus:border-transparent outline-none transition-all"
          placeholder="Tu nombre"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Correo electrónico
        </label>
        <input
          type="email"
          id="email"
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#9054C6] focus:border-transparent outline-none transition-all"
          placeholder="tu@email.com"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
          Número de WhatsApp
        </label>
        <div className="flex">
          <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 rounded-l-lg">
            +57
          </span>
          <input
            type="tel"
            id="phone"
            required
            pattern="[0-9]{10}"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-[#9054C6] focus:border-transparent outline-none transition-all"
            placeholder="3001234567"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
          />
        </div>
      </div>

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          id="terms"
          required
          className="mt-1 w-4 h-4 text-[#9054C6] border-gray-300 rounded focus:ring-[#9054C6]"
          checked={formData.acceptedTerms}
          onChange={(e) => setFormData({ ...formData, acceptedTerms: e.target.checked })}
        />
        <label htmlFor="terms" className="text-sm text-gray-600">
          Acepto los{' '}
          <a href="/terms-of-service" target="_blank" className="text-[#9054C6] hover:underline">
            términos de servicio
          </a>{' '}
          y la{' '}
          <a href="/privacy-policy" target="_blank" className="text-[#9054C6] hover:underline">
            política de privacidad
          </a>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-6 bg-[#9054C6] text-white font-medium rounded-lg hover:bg-[#7a3fad] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Registrando...' : 'Registrarme gratis'}
      </button>

      <p className="text-xs text-center text-gray-500">
        Plan gratuito: 3 búsquedas durante 3 días
      </p>
    </form>
  );
}
```

### 3.2 Crear modal de registro

**Archivo:** `apps/landing/src/components/RegistrationModal.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import RegistrationForm from './RegistrationForm';

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RegistrationModal({ isOpen, onClose }: RegistrationModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">
            Regístrate en CIO
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <p className="text-gray-600 mb-6">
            Completa tus datos para comenzar a usar el CIO y encontrar ofertas de empleo personalizadas.
          </p>
          <RegistrationForm onSuccess={onClose} />
        </div>
      </div>
    </div>
  );
}
```

### 3.3 Modificar componentes de landing

Los botones de WhatsApp en `Hero.tsx` y `Benefits.tsx` deben abrir el modal de registro en lugar de ir directo a WhatsApp.

---

## 💬 FASE 4: Flujo Conversacional del CIO ✅ (PARCIALMENTE IMPLEMENTADO)

### 4.1 Estados de conversación (YA IMPLEMENTADO)

**Archivo:** `apps/backend/src/modules/conversation/types/conversation-states.ts`

Estados agregados:
- `FREEMIUM_EXPIRED` - Cuando se agota el freemium
- `ASK_EMAIL` - Pedir email para vincular pago
- `WAITING_PAYMENT` - Esperando confirmación de pago

### 4.2 Flujo de usuario no registrado (YA IMPLEMENTADO)

**Archivo:** `apps/backend/src/modules/conversation/conversation.service.ts`

- `findUserByPhone()` - Busca usuario sin crear
- `handleIncomingMessage()` - Retorna `NOT_REGISTERED` si no existe
- `handleNewState()` - Verifica suscripción y da bienvenida apropiada

### 4.3 Control de usos (YA IMPLEMENTADO)

**Método:** `checkAndDeductUsage(userId, usageType)`

```typescript
// Verifica y deduce uso
// - FREEMIUM: 3 usos O 3 días
// - PREMIUM: 5 usos por semana (reset los lunes)
// Retorna: { allowed: boolean, message?: string, usesLeft?: number }
```

### 4.4 Handlers de pago (YA IMPLEMENTADO)

- `handleFreemiumExpiredState()` - Muestra enlace de pago
- `handleAskEmailState()` - Verifica pago por email
- `handleWaitingPaymentState()` - Permite verificar/cambiar email
- `activatePremiumForUser()` - Activa premium y vincula transacción

### 4.5 Cancelar servicio (YA IMPLEMENTADO)

**Método:** `deleteUserCompletely()` - Modificado para:
- ✅ Eliminar UserProfile (preferencias)
- ✅ Eliminar AlertPreference
- ✅ Eliminar JobSearchLog y SentJob
- ✅ Resetear sesión a NEW
- ❌ NO eliminar User (mantiene identidad)
- ❌ NO eliminar Subscription (mantiene estado de pago)

---

## 💰 FASE 5: Integración con Wompi (Webhooks)

### 5.1 Crear módulo de pagos

**Crear carpeta:** `apps/backend/src/modules/payment/`

**Archivos:**
- `payment.module.ts`
- `payment.controller.ts`
- `payment.service.ts`
- `dto/wompi-webhook.dto.ts`

### 5.2 DTO para webhook de Wompi

**Archivo:** `apps/backend/src/modules/payment/dto/wompi-webhook.dto.ts`

```typescript
export interface WompiWebhookPayload {
  event: string;  // 'transaction.updated'
  data: {
    transaction: {
      id: string;
      created_at: string;
      finalized_at: string;
      amount_in_cents: number;
      reference: string;
      currency: string;
      payment_method_type: string;
      payment_method: {
        type: string;
        extra?: {
          name?: string;
          brand?: string;
          last_four?: string;
        };
      };
      status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
      status_message?: string;
      customer_email: string;
      customer_data?: {
        full_name?: string;
        phone_number?: string;
      };
    };
  };
  environment: 'test' | 'prod';
  signature: {
    properties: string[];
    checksum: string;
  };
  timestamp: number;
  sent_at: string;
}
```

### 5.3 Controlador de webhooks de pago

**Archivo:** `apps/backend/src/modules/payment/payment.controller.ts`

```typescript
import { Controller, Post, Body, HttpCode, Logger, Headers } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { WompiWebhookPayload } from './dto/wompi-webhook.dto';

@Controller('webhook/wompi')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /webhook/wompi
   * Endpoint para recibir notificaciones de Wompi
   */
  @Post()
  @HttpCode(200)
  async handleWompiWebhook(
    @Body() payload: WompiWebhookPayload,
    @Headers('x-event-checksum') checksum: string,
  ) {
    this.logger.log(`💳 Webhook de Wompi recibido: ${payload.event}`);
    
    try {
      // Verificar firma del webhook
      const isValid = await this.paymentService.verifyWebhookSignature(payload, checksum);
      
      if (!isValid) {
        this.logger.warn('⚠️ Firma de webhook inválida');
        return { status: 'invalid_signature' };
      }

      // Procesar según el evento
      if (payload.event === 'transaction.updated') {
        await this.paymentService.handleTransactionUpdate(payload);
      }

      return { status: 'ok' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Error procesando webhook Wompi: ${errorMessage}`);
      return { status: 'error' };
    }
  }
}
```

### 5.4 Servicio de pagos

**Archivo:** `apps/backend/src/modules/payment/payment.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WompiWebhookPayload } from './dto/wompi-webhook.dto';
import * as crypto from 'crypto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly wompiEventsSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
  ) {
    this.wompiEventsSecret = this.configService.get<string>('WOMPI_EVENTS_SECRET', '');
  }

  /**
   * Verifica la firma del webhook de Wompi
   * Documentación: https://docs.wompi.co/docs/colombia/eventos
   */
  async verifyWebhookSignature(payload: WompiWebhookPayload, checksum: string): Promise<boolean> {
    try {
      if (!this.wompiEventsSecret) {
        this.logger.warn('⚠️ WOMPI_EVENTS_SECRET no configurado, aceptando webhook sin verificar');
        return true;
      }

      // Construir string para verificar según documentación Wompi
      const properties = payload.signature.properties;
      const transaction = payload.data.transaction;

      let stringToSign = '';
      for (const prop of properties) {
        const value = this.getNestedProperty(transaction, prop);
        stringToSign += value;
      }
      stringToSign += payload.timestamp;
      stringToSign += this.wompiEventsSecret;

      // Calcular checksum SHA256
      const calculatedChecksum = crypto
        .createHash('sha256')
        .update(stringToSign)
        .digest('hex');

      return calculatedChecksum === payload.signature.checksum;
    } catch (error) {
      this.logger.error('Error verificando firma de webhook');
      return false;
    }
  }

  /**
   * Obtiene propiedad anidada de un objeto
   */
  private getNestedProperty(obj: any, path: string): string {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj)?.toString() || '';
  }

  /**
   * Maneja actualización de transacción desde Wompi
   */
  async handleTransactionUpdate(payload: WompiWebhookPayload): Promise<void> {
    const { transaction } = payload.data;

    this.logger.log(
      `💳 Transacción ${transaction.id}: ${transaction.status} - ${transaction.customer_email}`,
    );

    // Guardar/actualizar transacción en BD
    await this.prisma.transaction.upsert({
      where: { wompiId: transaction.id },
      update: {
        wompiStatus: transaction.status,
        rawPayload: payload as any,
        updatedAt: new Date(),
      },
      create: {
        wompiId: transaction.id,
        wompiReference: transaction.reference,
        wompiStatus: transaction.status,
        amount: transaction.amount_in_cents,
        currency: transaction.currency,
        paymentMethod: transaction.payment_method_type,
        email: transaction.customer_email.toLowerCase(),
        rawPayload: payload as any,
      },
    });

    // Si la transacción fue APROBADA, intentar vincular usuario
    if (transaction.status === 'APPROVED') {
      await this.tryLinkAndActivatePremium(
        transaction.id,
        transaction.customer_email.toLowerCase(),
      );
    }
  }

  /**
   * Intenta vincular una transacción aprobada con un usuario existente
   * y activar su plan premium
   */
  private async tryLinkAndActivatePremium(wompiId: string, email: string): Promise<void> {
    // Buscar usuario con ese email
    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { subscription: true },
    });

    if (!user) {
      this.logger.log(`ℹ️ No hay usuario con email ${email} aún. Se vinculará cuando lo ingrese en el chat.`);
      return;
    }

    // Verificar si la transacción ya está vinculada
    const transaction = await this.prisma.transaction.findUnique({
      where: { wompiId },
    });

    if (transaction?.userId) {
      this.logger.log(`ℹ️ Transacción ${wompiId} ya vinculada a usuario ${transaction.userId}`);
      return;
    }

    // Vincular transacción
    await this.prisma.transaction.update({
      where: { wompiId },
      data: {
        userId: user.id,
        linkedAt: new Date(),
      },
    });

    // Activar premium
    await this.prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        plan: 'PREMIUM',
        status: 'ACTIVE',
        premiumStartDate: new Date(),
        premiumUsesLeft: 5,
        premiumWeekStart: this.getWeekStart(new Date()),
      },
      create: {
        userId: user.id,
        plan: 'PREMIUM',
        status: 'ACTIVE',
        premiumStartDate: new Date(),
        premiumUsesLeft: 5,
        premiumWeekStart: this.getWeekStart(new Date()),
      },
    });

    // Notificar al usuario por WhatsApp
    try {
      await this.whatsappService.sendBotReply(user.phone, {
        text: `🎉 *¡Felicidades, ${user.name}!*

Tu pago ha sido confirmado exitosamente.

✨ Ya tienes acceso al *Plan Premium*:
• 5 búsquedas/alertas por semana
• Sin límite de tiempo
• Acceso prioritario a nuevas funciones

¿Qué te gustaría hacer?
• Escribe *"buscar"* para encontrar ofertas ahora`,
      });
    } catch (error) {
      this.logger.warn(`No se pudo notificar al usuario ${user.phone}`);
    }

    this.logger.log(`✅ Usuario ${user.id} (${user.phone}) activado como PREMIUM automáticamente`);
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
```

### 5.5 Módulo de pagos

**Archivo:** `apps/backend/src/modules/payment/payment.module.ts`

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { DatabaseModule } from '../database/database.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => WhatsappModule), // forwardRef para evitar dependencia circular
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
```

### 5.6 Registrar en app.module.ts

```typescript
import { PaymentModule } from './modules/payment/payment.module';

@Module({
  imports: [
    // ... otros imports ...
    PaymentModule,
  ],
})
export class AppModule {}
```

### 5.7 Configuración en Panel de Wompi

1. Ir a **Panel de Wompi** → **Desarrolladores** → **Webhooks**
2. Agregar URL: `https://tu-backend.com/webhook/wompi`
3. Seleccionar eventos: `transaction.updated`
4. Copiar el **Events Secret** y guardarlo en `.env` como `WOMPI_EVENTS_SECRET`

---

## 🔧 FASE 6: Endpoints de Administración

### 6.1 Crear módulo de admin

**Crear carpeta:** `apps/backend/src/modules/admin/`

**Archivos:**
- `admin.module.ts`
- `admin.controller.ts`
- `admin.service.ts`
- `guards/admin.guard.ts`

### 6.2 Guard de autenticación admin

**Archivo:** `apps/backend/src/modules/admin/guards/admin.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['x-admin-key'];

    const adminKey = this.configService.get<string>('ADMIN_API_KEY');

    if (!adminKey) {
      throw new UnauthorizedException('Admin API key not configured');
    }

    if (authHeader !== adminKey) {
      throw new UnauthorizedException('Invalid admin key');
    }

    return true;
  }
}
```

### 6.3 Controlador de admin

**Archivo:** `apps/backend/src/modules/admin/admin.controller.ts`

```typescript
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /admin/users
   * Lista todos los usuarios con su suscripción
   */
  @Get('users')
  async listUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('plan') plan?: 'FREEMIUM' | 'PREMIUM',
  ) {
    return this.adminService.listUsers({ page, limit, plan });
  }

  /**
   * GET /admin/users/:id
   * Obtiene detalle de un usuario
   */
  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  /**
   * GET /admin/users/phone/:phone
   * Busca usuario por teléfono
   */
  @Get('users/phone/:phone')
  async getUserByPhone(@Param('phone') phone: string) {
    return this.adminService.getUserByPhone(phone);
  }

  /**
   * PUT /admin/users/:id/subscription
   * Actualiza suscripción de un usuario
   */
  @Put('users/:id/subscription')
  async updateSubscription(
    @Param('id') userId: string,
    @Body() data: {
      plan?: 'FREEMIUM' | 'PREMIUM';
      premiumUsesLeft?: number;
      freemiumUsesLeft?: number;
      freemiumExpired?: boolean;
      status?: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
    },
  ) {
    return this.adminService.updateSubscription(userId, data);
  }

  /**
   * POST /admin/users/:id/grant-searches
   * Otorga búsquedas adicionales a un usuario
   */
  @Post('users/:id/grant-searches')
  @HttpCode(200)
  async grantSearches(
    @Param('id') userId: string,
    @Body() data: { amount: number; reason?: string },
  ) {
    return this.adminService.grantSearches(userId, data.amount, data.reason);
  }

  /**
   * POST /admin/users/:id/activate-premium
   * Activa plan premium manualmente (para empresas o testeo)
   */
  @Post('users/:id/activate-premium')
  @HttpCode(200)
  async activatePremium(
    @Param('id') userId: string,
    @Body() data: { reason?: string; durationDays?: number; usesPerWeek?: number },
  ) {
    return this.adminService.activatePremiumManually(
      userId,
      data.reason,
      data.durationDays,
      data.usesPerWeek,
    );
  }

  /**
   * POST /admin/users/:id/reset-freemium
   * Resetea el freemium de un usuario (para testeo)
   */
  @Post('users/:id/reset-freemium')
  @HttpCode(200)
  async resetFreemium(
    @Param('id') userId: string,
    @Body() data: { reason?: string },
  ) {
    return this.adminService.resetFreemium(userId, data.reason);
  }

  /**
   * GET /admin/stats
   * Estadísticas generales del sistema
   */
  @Get('stats')
  async getStats() {
    return this.adminService.getSystemStats();
  }

  /**
   * GET /admin/transactions
   * Lista transacciones de pago
   */
  @Get('transactions')
  async listTransactions(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: string,
  ) {
    return this.adminService.listTransactions({ page, limit, status });
  }
}
```

### 6.4 Servicio de admin

**Archivo:** `apps/backend/src/modules/admin/admin.service.ts`

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listUsers(params: { page: number; limit: number; plan?: string }) {
    const { page, limit, plan } = params;
    const skip = (page - 1) * limit;

    const where = plan ? { subscription: { plan } } : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          subscription: true,
          profile: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
        profile: true,
        alert: true,
        transactions: true,
        searchLogs: {
          take: 10,
          orderBy: { executedAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  async getUserByPhone(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: {
        subscription: true,
        profile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  async updateSubscription(userId: string, data: any) {
    const subscription = await this.prisma.subscription.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });

    this.logger.log(`📝 Suscripción actualizada para ${userId}: ${JSON.stringify(data)}`);

    return subscription;
  }

  async grantSearches(userId: string, amount: number, reason?: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new NotFoundException('Suscripción no encontrada');
    }

    let updateData: any = {};

    if (subscription.plan === 'PREMIUM') {
      updateData.premiumUsesLeft = subscription.premiumUsesLeft + amount;
    } else {
      updateData.freemiumUsesLeft = subscription.freemiumUsesLeft + amount;
      // Si estaba expirado, reactivar
      if (subscription.freemiumExpired) {
        updateData.freemiumExpired = false;
      }
    }

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: updateData,
    });

    this.logger.log(`🎁 Otorgadas ${amount} búsquedas a ${userId}. Razón: ${reason || 'N/A'}`);

    return {
      success: true,
      message: `Se otorgaron ${amount} búsquedas adicionales`,
      subscription: updated,
    };
  }

  async activatePremiumManually(
    userId: string,
    reason?: string,
    durationDays?: number,
    usesPerWeek: number = 5,
  ) {
    const now = new Date();
    const endDate = durationDays
      ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
      : null;

    const subscription = await this.prisma.subscription.upsert({
      where: { userId },
      update: {
        plan: 'PREMIUM',
        status: 'ACTIVE',
        premiumStartDate: now,
        premiumEndDate: endDate,
        premiumUsesLeft: usesPerWeek,
        premiumWeekStart: this.getWeekStart(now),
      },
      create: {
        userId,
        plan: 'PREMIUM',
        status: 'ACTIVE',
        premiumStartDate: now,
        premiumEndDate: endDate,
        premiumUsesLeft: usesPerWeek,
        premiumWeekStart: this.getWeekStart(now),
      },
    });

    this.logger.log(
      `👑 Premium activado manualmente para ${userId}. Razón: ${reason || 'N/A'}. Duración: ${durationDays || 'Indefinido'} días`,
    );

    return {
      success: true,
      message: 'Plan Premium activado exitosamente',
      subscription,
    };
  }

  async resetFreemium(userId: string, reason?: string) {
    const subscription = await this.prisma.subscription.upsert({
      where: { userId },
      update: {
        plan: 'FREEMIUM',
        status: 'ACTIVE',
        freemiumUsesLeft: 3,
        freemiumStartDate: new Date(),
        freemiumExpired: false,
      },
      create: {
        userId,
        plan: 'FREEMIUM',
        status: 'ACTIVE',
        freemiumUsesLeft: 3,
        freemiumStartDate: new Date(),
        freemiumExpired: false,
      },
    });

    this.logger.log(`🔄 Freemium reseteado para ${userId}. Razón: ${reason || 'N/A'}`);

    return {
      success: true,
      message: 'Plan Freemium reseteado exitosamente',
      subscription,
    };
  }

  async getSystemStats() {
    const [
      totalUsers,
      freemiumUsers,
      premiumUsers,
      expiredFreemium,
      totalSearches,
      totalTransactions,
      approvedTransactions,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.subscription.count({ where: { plan: 'FREEMIUM', freemiumExpired: false } }),
      this.prisma.subscription.count({ where: { plan: 'PREMIUM', status: 'ACTIVE' } }),
      this.prisma.subscription.count({ where: { freemiumExpired: true } }),
      this.prisma.jobSearchLog.count(),
      this.prisma.transaction.count(),
      this.prisma.transaction.count({ where: { wompiStatus: 'APPROVED' } }),
    ]);

    return {
      users: {
        total: totalUsers,
        freemium: freemiumUsers,
        premium: premiumUsers,
        expiredFreemium,
      },
      searches: {
        total: totalSearches,
      },
      transactions: {
        total: totalTransactions,
        approved: approvedTransactions,
      },
      conversionRate:
        totalUsers > 0 ? ((premiumUsers / totalUsers) * 100).toFixed(2) + '%' : '0%',
    };
  }

  async listTransactions(params: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = params;
    const skip = (page - 1) * limit;

    const where = status ? { wompiStatus: status } : {};

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: { user: { select: { id: true, name: true, phone: true, email: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
```

### 6.5 Módulo de admin

**Archivo:** `apps/backend/src/modules/admin/admin.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
```

### 6.6 Registrar en app.module.ts

```typescript
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // ... otros imports ...
    AdminModule,
  ],
})
export class AppModule {}
```

---

## 🧪 FASE 7: Testeo Manual

### 7.1 Usando el endpoint de admin

**Buscar usuario por teléfono:**
```bash
curl -X GET "https://tu-api.com/admin/users/phone/573001234567" \
  -H "x-admin-key: TU_ADMIN_API_KEY"
```

**Otorgar búsquedas a un usuario:**
```bash
curl -X POST "https://tu-api.com/admin/users/USER_ID/grant-searches" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: TU_ADMIN_API_KEY" \
  -d '{"amount": 5, "reason": "Testing"}'
```

**Activar premium manualmente:**
```bash
curl -X POST "https://tu-api.com/admin/users/USER_ID/activate-premium" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: TU_ADMIN_API_KEY" \
  -d '{"reason": "Cliente empresarial", "durationDays": 30, "usesPerWeek": 10}'
```

**Resetear freemium (para testeo):**
```bash
curl -X POST "https://tu-api.com/admin/users/USER_ID/reset-freemium" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: TU_ADMIN_API_KEY" \
  -d '{"reason": "Testing"}'
```

**Ver estadísticas:**
```bash
curl -X GET "https://tu-api.com/admin/stats" \
  -H "x-admin-key: TU_ADMIN_API_KEY"
```

### 7.2 Modificando directamente en BD (Prisma Studio)

```bash
cd apps/backend
npx prisma studio
```

En la UI:
1. Ir a tabla `Subscription`
2. Buscar el registro del usuario
3. Modificar campos según necesidad:
   - `plan`: `FREEMIUM` o `PREMIUM`
   - `freemiumUsesLeft` / `premiumUsesLeft`: número de usos
   - `freemiumExpired`: true/false
   - `status`: `ACTIVE`, `EXPIRED`, `CANCELLED`
4. Guardar

---

## ⚙️ Variables de Entorno

### Backend (.env)

```env
# Base de datos
DATABASE_URL=postgresql://user:password@localhost:5433/cio_dev

# WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_VERIFY_TOKEN=your_verify_token

# Wompi
WOMPI_PUBLIC_KEY=pub_test_xxxxx
WOMPI_PRIVATE_KEY=prv_test_xxxxx
WOMPI_EVENTS_SECRET=test_events_xxxxx
WOMPI_PAYMENT_LINK=https://checkout.wompi.co/l/TU_LINK

# Admin
ADMIN_API_KEY=una_clave_muy_segura_y_larga

# CORS
CORS_ORIGIN=https://cioalmia.vercel.app

# Puerto
PORT=3001
```

### Landing (.env.local)

```env
NEXT_PUBLIC_API_URL=https://tu-backend.com
NEXT_PUBLIC_WHATSAPP_NUMBER=573226906461
```

---

## 📋 Checklist de Implementación Completo

### FASE 1: Base de Datos ✅
- [x] Agregar campos `name` y `email` a modelo User
- [x] Crear modelo `Subscription`
- [x] Crear modelo `Transaction`
- [x] Crear enums `PlanType` y `SubscriptionStatus`
- [x] Ejecutar migración

### FASE 2: API de Registro
- [ ] Crear carpeta `registration/`
- [ ] Crear `dto/register-user.dto.ts`
- [ ] Crear `registration.controller.ts`
- [ ] Crear `registration.service.ts`
- [ ] Crear `registration.module.ts`
- [ ] Registrar en `app.module.ts`
- [ ] Configurar CORS en `main.ts`

### FASE 3: Landing - Formulario
- [ ] Crear `RegistrationForm.tsx`
- [ ] Crear `RegistrationModal.tsx`
- [ ] Modificar `Hero.tsx` para abrir modal
- [ ] Modificar `Benefits.tsx` para abrir modal
- [ ] Configurar variable `NEXT_PUBLIC_API_URL`

### FASE 4: Flujo Conversacional ✅
- [x] Agregar estados `FREEMIUM_EXPIRED`, `ASK_EMAIL`, `WAITING_PAYMENT`
- [x] Modificar `handleIncomingMessage` para verificar registro
- [x] Modificar `handleNewState` para nuevo flujo
- [x] Crear `checkAndDeductUsage`
- [x] Crear handlers de pago (`handleFreemiumExpiredState`, etc.)
- [x] Modificar `deleteUserCompletely` para mantener identidad
- [x] Actualizar mensajes en `bot-messages.ts`

### FASE 5: Wompi
- [ ] Crear carpeta `payment/`
- [ ] Crear `dto/wompi-webhook.dto.ts`
- [ ] Crear `payment.controller.ts`
- [ ] Crear `payment.service.ts`
- [ ] Crear `payment.module.ts`
- [ ] Registrar en `app.module.ts`
- [ ] Configurar webhook en panel de Wompi

### FASE 6: Administración
- [ ] Crear carpeta `admin/`
- [ ] Crear `guards/admin.guard.ts`
- [ ] Crear `admin.controller.ts`
- [ ] Crear `admin.service.ts`
- [ ] Crear `admin.module.ts`
- [ ] Registrar en `app.module.ts`

### Variables de Entorno
- [ ] Configurar `WOMPI_*` en backend
- [ ] Configurar `ADMIN_API_KEY` en backend
- [ ] Configurar `CORS_ORIGIN` en backend
- [ ] Configurar `NEXT_PUBLIC_API_URL` en landing

---

## ❓ Respuestas a tus Preguntas

### 1. ¿Cómo asignar búsquedas manualmente?

**Opción A - Endpoint de admin:**
```bash
POST /admin/users/:userId/grant-searches
Header: x-admin-key: TU_CLAVE
Body: {"amount": 5, "reason": "Testing"}
```

**Opción B - Activar premium:**
```bash
POST /admin/users/:userId/activate-premium
Header: x-admin-key: TU_CLAVE
Body: {"reason": "Cliente empresarial", "usesPerWeek": 10}
```

**Opción C - Prisma Studio:**
```bash
npx prisma studio
# Modificar subscription directamente
```

### 2. ¿Wompi funciona con webhooks?

**Sí.** Wompi envía eventos `transaction.updated` cuando una transacción cambia de estado.

**Flujo:**
1. Usuario paga en Wompi
2. Wompi envía POST a `/webhook/wompi`
3. Backend verifica firma y guarda transacción
4. Si status = `APPROVED` y email coincide con usuario → Activa premium automáticamente
5. Si no coincide → El usuario puede ingresar el email en el chat para vincular

### 3. ¿Qué pasa cuando el usuario cancela y vuelve?

1. Se eliminan sus preferencias (UserProfile, AlertPreference, etc.)
2. Se mantienen: User (identidad) y Subscription (estado de pago)
3. Al volver:
   - Si tiene premium activo → Puede usar el bot
   - Si tiene freemium expirado → Debe pagar
   - **No puede obtener nueva prueba gratuita** (freemiumExpired se mantiene)

### 4. ¿Cómo ofrecer el servicio a empresas?

Usar el endpoint:
```bash
POST /admin/users/:userId/activate-premium
{
  "reason": "Cliente empresarial - Empresa XYZ",
  "durationDays": 365,  // 1 año
  "usesPerWeek": 50     // Más búsquedas para empresas
}
```

---

**¿Está completo ahora? Dime si falta algo o si podemos continuar con la implementación.**
