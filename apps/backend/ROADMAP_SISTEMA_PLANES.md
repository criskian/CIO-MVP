# 🗺️ ROADMAP: Implementación Sistema de Planes (Freemium + Pago)

## 📋 Resumen Ejecutivo

Este documento detalla la implementación completa del sistema de planes para CIO, dividiendo a los usuarios en **Plan Freemium** y **Plan Premium**. Incluye:
- Modificaciones a la base de datos
- Nuevos flujos conversacionales
- Integración con Wompi para pagos
- Endpoints de administración
- Lógica de control de usos

---

## 📊 Estructura Actual vs Nueva

### Estado Actual
```
User → UserProfile → Session → AlertPreference → JobSearchLog → SentJob
```
- Todo usuario puede usar el CIO sin restricciones
- No hay control de usos ni planes
- Al "cancelar servicio" se elimina TODO el usuario

### Estado Nuevo
```
User (+ nombre, email, plan, etc.)
  → UserProfile (preferencias, se pueden eliminar)
  → Session
  → AlertPreference
  → JobSearchLog
  → SentJob
  → Subscription (plan activo, fechas, usos restantes)
  → Transaction (historial de pagos via Wompi)
```

---

## 🗃️ FASE 1: Modificaciones a la Base de Datos

### 1.1 Modificar modelo `User`

**Archivo:** `apps/backend/prisma/schema.prisma`

**Cambios:**
```prisma
model User {
  id        String   @id @default(cuid())
  phone     String   @unique
  
  // NUEVOS CAMPOS
  name      String?              // Nombre del usuario (se pide al inicio)
  email     String?  @unique     // Email (se pide al agotar freemium)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relaciones existentes
  profile       UserProfile?
  sessions      Session[]
  alert         AlertPreference?
  searchLogs    JobSearchLog[]
  sentJobs      SentJob[]
  
  // NUEVAS RELACIONES
  subscription  Subscription?
  transactions  Transaction[]

  @@map("users")
}
```

### 1.2 Crear modelo `Subscription`

**Agregar en:** `apps/backend/prisma/schema.prisma`

```prisma
model Subscription {
  id                String    @id @default(cuid())
  userId            String    @unique
  
  // Plan actual
  plan              PlanType  @default(FREEMIUM)  // FREEMIUM o PREMIUM
  
  // Control de usos freemium
  freemiumUsesLeft  Int       @default(3)         // Búsquedas/alertas restantes (freemium)
  freemiumStartDate DateTime  @default(now())     // Fecha inicio freemium
  freemiumExpired   Boolean   @default(false)     // Si ya expiró el freemium
  
  // Control de usos premium
  premiumUsesLeft   Int       @default(0)         // Búsquedas/alertas restantes esta semana (premium)
  premiumWeekStart  DateTime?                     // Inicio de la semana actual de conteo
  
  // Fechas de suscripción premium
  premiumStartDate  DateTime?                     // Fecha de activación premium
  premiumEndDate    DateTime?                     // Fecha de expiración premium (si aplica)
  
  // Estado
  status            SubscriptionStatus @default(ACTIVE) // ACTIVE, EXPIRED, CANCELLED
  
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

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

### 1.3 Crear modelo `Transaction`

**Agregar en:** `apps/backend/prisma/schema.prisma`

```prisma
model Transaction {
  id              String            @id @default(cuid())
  userId          String?                                // Puede ser null hasta vincular email
  
  // Datos de Wompi
  wompiId         String            @unique              // ID de transacción en Wompi
  wompiReference  String                                 // Referencia de pago
  wompiStatus     String                                 // APPROVED, DECLINED, PENDING, etc.
  
  // Datos del pago
  amount          Int                                    // Monto en centavos (COP)
  currency        String            @default("COP")
  paymentMethod   String?                               // PSE, CARD, NEQUI, etc.
  email           String                                 // Email usado en el pago
  
  // Vinculación
  linkedAt        DateTime?                             // Fecha cuando se vinculó al usuario
  
  // Metadata
  rawPayload      Json?                                 // Payload completo de Wompi
  
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  user            User?             @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([email])
  @@index([wompiReference])
  @@map("transactions")
}
```

### 1.4 Crear migración

**Comando a ejecutar:**
```bash
cd apps/backend
npx prisma migrate dev --name add_subscription_and_transaction_models
```

---

## 🔄 FASE 2: Nuevos Estados de Conversación

### 2.1 Agregar estados en `conversation-states.ts`

**Archivo:** `apps/backend/src/modules/conversation/types/conversation-states.ts`

**Agregar los siguientes estados:**
```typescript
export enum ConversationState {
  // ... estados existentes ...
  
  // NUEVOS ESTADOS PARA ONBOARDING
  ASK_NAME = 'ASK_NAME',                    // Preguntar nombre al inicio
  
  // NUEVOS ESTADOS PARA FIN DE FREEMIUM
  FREEMIUM_EXPIRED = 'FREEMIUM_EXPIRED',    // Mostrar que se acabó freemium
  ASK_EMAIL = 'ASK_EMAIL',                  // Pedir email para vincular pago
  WAITING_PAYMENT = 'WAITING_PAYMENT',      // Esperando confirmación de pago
  
  // ESTADO PARA USUARIOS QUE VUELVEN
  RETURNING_USER = 'RETURNING_USER',        // Usuario que canceló y vuelve
}
```

### 2.2 Nuevo flujo de onboarding

**Flujo actualizado:**
```
NEW → ASK_NAME → ASK_DEVICE → ASK_TERMS → ASK_ROLE → ... → READY
```

**Antes de ASK_DEVICE**, preguntar el nombre.

---

## 💬 FASE 3: Modificaciones al Flujo Conversacional

### 3.1 Modificar `handleNewState` para pedir nombre

**Archivo:** `apps/backend/src/modules/conversation/conversation.service.ts`

**Ubicación:** Línea ~195 (`handleNewState`)

**Cambio:**
```typescript
private async handleNewState(userId: string): Promise<BotReply> {
  this.logger.log(`👤 Nuevo usuario: ${userId}`);

  // Verificar si el usuario ya tiene suscripción (usuario que vuelve)
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });

  // Si tiene suscripción activa premium, dar bienvenida premium
  if (user?.subscription?.plan === 'PREMIUM' && user.subscription.status === 'ACTIVE') {
    await this.updateSessionState(userId, ConversationState.ASK_DEVICE);
    return {
      text: `¡Hola de nuevo, ${user.name || 'usuario'}! 👋\n\nVeo que tienes el plan *Premium* activo. ¡Continuemos!\n\n${BotMessages.ASK_DEVICE}`,
    };
  }

  // Si ya agotó freemium, ir directo a pedir email/pago
  if (user?.subscription?.freemiumExpired) {
    await this.updateSessionState(userId, ConversationState.FREEMIUM_EXPIRED);
    return {
      text: BotMessages.FREEMIUM_EXPIRED_RETURNING_USER(user.name),
    };
  }

  // Usuario nuevo → pedir nombre
  await this.updateSessionState(userId, ConversationState.ASK_NAME);
  return {
    text: BotMessages.ASK_NAME,
  };
}
```

### 3.2 Crear handler `handleAskNameState`

**Agregar después de `handleNewState`:**
```typescript
private async handleAskNameState(userId: string, text: string): Promise<BotReply> {
  const name = text.trim();

  // Validar nombre (mínimo 2 caracteres, máximo 50)
  if (name.length < 2 || name.length > 50) {
    return { text: BotMessages.ERROR_NAME_INVALID };
  }

  // Guardar nombre en User
  await this.prisma.user.update({
    where: { id: userId },
    data: { name },
  });

  // Crear suscripción freemium inicial
  await this.prisma.subscription.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      plan: 'FREEMIUM',
      freemiumUsesLeft: 3,
      freemiumStartDate: new Date(),
    },
  });

  // Transición: ASK_NAME → ASK_DEVICE
  await this.updateSessionState(userId, ConversationState.ASK_DEVICE);

  return {
    text: `¡Mucho gusto, *${name}*! 😊\n\n${BotMessages.ASK_DEVICE}`,
  };
}
```

### 3.3 Modificar `handleReadyState` para verificar usos

**Archivo:** `apps/backend/src/modules/conversation/conversation.service.ts`

**Ubicación:** Línea ~797 (`handleReadyState`)

**Antes de ejecutar búsqueda, verificar usos:**
```typescript
private async handleReadyState(
  userId: string,
  text: string,
  intent: UserIntent,
): Promise<BotReply> {
  // ... código existente para detectar intent ...

  // Detectar intención de buscar empleos
  if (intent === UserIntent.SEARCH_NOW) {
    // NUEVO: Verificar usos disponibles antes de buscar
    const canSearch = await this.checkAndDeductUsage(userId, 'search');
    
    if (!canSearch.allowed) {
      // Redirigir al flujo de freemium agotado
      await this.updateSessionState(userId, ConversationState.FREEMIUM_EXPIRED);
      return { text: canSearch.message };
    }

    return await this.performJobSearch(userId);
  }

  // ... resto del código ...
}
```

### 3.4 Crear método `checkAndDeductUsage`

**Agregar en `conversation.service.ts`:**
```typescript
/**
 * Verifica si el usuario puede usar el servicio y deduce un uso si es posible
 * @returns { allowed: boolean, message?: string }
 */
private async checkAndDeductUsage(
  userId: string,
  usageType: 'search' | 'alert'
): Promise<{ allowed: boolean; message?: string }> {
  const subscription = await this.prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    // Crear suscripción por defecto si no existe
    await this.prisma.subscription.create({
      data: {
        userId,
        plan: 'FREEMIUM',
        freemiumUsesLeft: 3,
      },
    });
    return { allowed: true };
  }

  // PLAN PREMIUM
  if (subscription.plan === 'PREMIUM' && subscription.status === 'ACTIVE') {
    // Verificar si es nueva semana
    const weekStart = subscription.premiumWeekStart;
    const now = new Date();
    
    if (!weekStart || this.isNewWeek(weekStart, now)) {
      // Resetear usos semanales
      await this.prisma.subscription.update({
        where: { userId },
        data: {
          premiumUsesLeft: 5,
          premiumWeekStart: this.getWeekStart(now),
        },
      });
      return { allowed: true };
    }

    if (subscription.premiumUsesLeft > 0) {
      await this.prisma.subscription.update({
        where: { userId },
        data: { premiumUsesLeft: subscription.premiumUsesLeft - 1 },
      });
      return { allowed: true };
    }

    return {
      allowed: false,
      message: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED,
    };
  }

  // PLAN FREEMIUM
  // Verificar si pasaron 3 días (expiración por tiempo)
  const daysSinceStart = Math.floor(
    (Date.now() - subscription.freemiumStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceStart >= 3 || subscription.freemiumUsesLeft <= 0) {
    // Marcar freemium como expirado
    await this.prisma.subscription.update({
      where: { userId },
      data: { freemiumExpired: true },
    });

    return {
      allowed: false,
      message: BotMessages.FREEMIUM_EXPIRED,
    };
  }

  // Deducir uso freemium
  await this.prisma.subscription.update({
    where: { userId },
    data: { freemiumUsesLeft: subscription.freemiumUsesLeft - 1 },
  });

  return { allowed: true };
}

/**
 * Verifica si estamos en una nueva semana (lunes a domingo)
 */
private isNewWeek(weekStart: Date, now: Date): boolean {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return now >= weekEnd;
}

/**
 * Obtiene el inicio de la semana actual (lunes 00:00)
 */
private getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
```

### 3.5 Crear handler `handleFreemiumExpiredState`

```typescript
private async handleFreemiumExpiredState(userId: string, text: string): Promise<BotReply> {
  const deviceType = await this.getDeviceType(userId);

  // Mostrar mensaje de freemium agotado y pedir email
  await this.updateSessionState(userId, ConversationState.ASK_EMAIL);

  return {
    text: BotMessages.FREEMIUM_EXPIRED_ASK_EMAIL,
  };
}
```

### 3.6 Crear handler `handleAskEmailState`

```typescript
private async handleAskEmailState(userId: string, text: string): Promise<BotReply> {
  const email = text.trim().toLowerCase();

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { text: BotMessages.ERROR_EMAIL_INVALID };
  }

  // Verificar si hay transacción con ese email
  const transaction = await this.prisma.transaction.findFirst({
    where: {
      email,
      wompiStatus: 'APPROVED',
      userId: null, // No vinculada aún
    },
  });

  if (transaction) {
    // ¡Pago encontrado! Vincular y activar premium
    await this.activatePremiumForUser(userId, email, transaction.id);
    
    await this.updateSessionState(userId, ConversationState.READY);
    
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    
    return {
      text: BotMessages.PAYMENT_CONFIRMED(user?.name),
    };
  }

  // No hay pago con ese email, guardar email y mostrar enlace de pago
  await this.prisma.user.update({
    where: { id: userId },
    data: { email },
  });

  await this.updateSessionState(userId, ConversationState.WAITING_PAYMENT);

  return {
    text: BotMessages.PAYMENT_LINK(email),
  };
}
```

### 3.7 Crear handler `handleWaitingPaymentState`

```typescript
private async handleWaitingPaymentState(userId: string, text: string): Promise<BotReply> {
  // Usuario puede escribir "verificar" para re-chequear pago
  // O escribir otro email para corregir

  const lower = text.toLowerCase().trim();

  if (lower.includes('verificar') || lower.includes('comprobar') || lower.includes('ya pague')) {
    // Re-verificar pago
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    
    if (!user?.email) {
      return { text: 'Por favor, primero ingresa tu correo electrónico.' };
    }

    const transaction = await this.prisma.transaction.findFirst({
      where: {
        email: user.email,
        wompiStatus: 'APPROVED',
        userId: null,
      },
    });

    if (transaction) {
      await this.activatePremiumForUser(userId, user.email, transaction.id);
      await this.updateSessionState(userId, ConversationState.READY);
      
      return {
        text: BotMessages.PAYMENT_CONFIRMED(user.name),
      };
    }

    return {
      text: BotMessages.PAYMENT_NOT_FOUND,
    };
  }

  // Si escribió un email, actualizar
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(text.trim())) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { email: text.trim().toLowerCase() },
    });

    return {
      text: `Email actualizado a *${text.trim()}*.\n\nEscribe *"verificar"* cuando hayas realizado el pago.`,
    };
  }

  return {
    text: BotMessages.WAITING_PAYMENT_HELP,
  };
}
```

### 3.8 Método para activar premium

```typescript
private async activatePremiumForUser(
  userId: string, 
  email: string, 
  transactionId: string
): Promise<void> {
  // Actualizar usuario con email
  await this.prisma.user.update({
    where: { id: userId },
    data: { email },
  });

  // Vincular transacción
  await this.prisma.transaction.update({
    where: { id: transactionId },
    data: {
      userId,
      linkedAt: new Date(),
    },
  });

  // Actualizar suscripción a premium
  await this.prisma.subscription.update({
    where: { userId },
    data: {
      plan: 'PREMIUM',
      status: 'ACTIVE',
      premiumStartDate: new Date(),
      premiumUsesLeft: 5,
      premiumWeekStart: this.getWeekStart(new Date()),
    },
  });

  this.logger.log(`✅ Usuario ${userId} activado como PREMIUM`);
}
```

---

## 💰 FASE 4: Integración con Wompi (Webhooks)

### 4.1 Crear módulo de pagos

**Crear carpeta:** `apps/backend/src/modules/payment/`

**Archivos a crear:**
- `payment.module.ts`
- `payment.controller.ts`
- `payment.service.ts`
- `dto/wompi-webhook.dto.ts`

### 4.2 DTO para webhook de Wompi

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
      billing_data?: any;
      shipping_address?: any;
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

### 4.3 Controlador de webhooks de pago

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

### 4.4 Servicio de pagos

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
   */
  async verifyWebhookSignature(payload: WompiWebhookPayload, checksum: string): Promise<boolean> {
    try {
      // Construir string para verificar según documentación Wompi
      // properties contiene las propiedades a concatenar en orden
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
    return path.split('.').reduce((acc, part) => acc && acc[part], obj) || '';
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
      await this.tryLinkTransaction(transaction.id, transaction.customer_email.toLowerCase());
    }
  }

  /**
   * Intenta vincular una transacción aprobada con un usuario existente
   */
  private async tryLinkTransaction(wompiId: string, email: string): Promise<void> {
    // Buscar usuario con ese email
    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { subscription: true },
    });

    if (!user) {
      this.logger.log(`ℹ️ No hay usuario con email ${email} aún. Se vinculará cuando lo ingrese.`);
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
    await this.prisma.subscription.update({
      where: { userId: user.id },
      data: {
        plan: 'PREMIUM',
        status: 'ACTIVE',
        premiumStartDate: new Date(),
        premiumUsesLeft: 5,
        premiumWeekStart: this.getWeekStart(new Date()),
      },
    });

    // Notificar al usuario por WhatsApp
    await this.whatsappService.sendBotReply(user.phone, {
      text: `🎉 *¡Felicidades, ${user.name}!*\n\nTu pago ha sido confirmado exitosamente.\n\n✨ Ya tienes acceso al *Plan Premium*:\n• 5 búsquedas/alertas por semana\n• Sin límite de tiempo\n• Acceso prioritario a nuevas funciones\n\n¿Qué te gustaría hacer?\n• Escribe *"buscar"* para encontrar ofertas`,
    });

    this.logger.log(`✅ Usuario ${user.id} activado como PREMIUM (pago automático)`);
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

### 4.5 Módulo de pagos

**Archivo:** `apps/backend/src/modules/payment/payment.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { DatabaseModule } from '../database/database.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [DatabaseModule, WhatsappModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
```

### 4.6 Registrar módulo en app.module.ts

**Archivo:** `apps/backend/src/app.module.ts`

**Agregar:**
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

---

## 🔧 FASE 5: Endpoint de Administración

### 5.1 Crear módulo de administración

**Crear carpeta:** `apps/backend/src/modules/admin/`

### 5.2 Controlador de admin

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
    @Body() data: { reason?: string; durationDays?: number },
  ) {
    return this.adminService.activatePremiumManually(userId, data.reason, data.durationDays);
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

### 5.3 Servicio de admin

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

  async updateSubscription(userId: string, data: any) {
    const subscription = await this.prisma.subscription.update({
      where: { userId },
      data,
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
    }

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: updateData,
    });

    this.logger.log(`🎁 Otorgadas ${amount} búsquedas a ${userId}. Razón: ${reason || 'N/A'}`);

    return updated;
  }

  async activatePremiumManually(userId: string, reason?: string, durationDays?: number) {
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
        premiumUsesLeft: 5,
        premiumWeekStart: this.getWeekStart(now),
      },
      create: {
        userId,
        plan: 'PREMIUM',
        status: 'ACTIVE',
        premiumStartDate: now,
        premiumEndDate: endDate,
        premiumUsesLeft: 5,
        premiumWeekStart: this.getWeekStart(now),
      },
    });

    this.logger.log(
      `👑 Premium activado manualmente para ${userId}. Razón: ${reason || 'N/A'}. Duración: ${durationDays || 'Indefinido'} días`,
    );

    return subscription;
  }

  async getSystemStats() {
    const [totalUsers, freemiumUsers, premiumUsers, totalSearches, totalTransactions] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.subscription.count({ where: { plan: 'FREEMIUM' } }),
        this.prisma.subscription.count({ where: { plan: 'PREMIUM' } }),
        this.prisma.jobSearchLog.count(),
        this.prisma.transaction.count({ where: { wompiStatus: 'APPROVED' } }),
      ]);

    return {
      totalUsers,
      freemiumUsers,
      premiumUsers,
      totalSearches,
      totalTransactions,
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
        include: { user: true },
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

### 5.4 Guard de autenticación admin

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

### 5.5 Módulo de admin

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

---

## 📝 FASE 6: Nuevos Mensajes del Bot

### 6.1 Agregar mensajes en `bot-messages.ts`

**Archivo:** `apps/backend/src/modules/conversation/helpers/bot-messages.ts`

**Agregar:**
```typescript
// === MENSAJES DE NOMBRE ===
ASK_NAME: `¡Hola! 👋 Soy *CIO, tu Cazador Inteligente de Ofertas* by ALMIA.

Antes de comenzar, *¿cuál es tu nombre?* 😊`,

ERROR_NAME_INVALID: `Por favor, ingresa un nombre válido (entre 2 y 50 caracteres).`,

// === MENSAJES DE FREEMIUM ===
FREEMIUM_EXPIRED: `😔 *Tu período de prueba gratuita ha terminado.*

Has usado tus 3 búsquedas/alertas gratuitas o han pasado 3 días desde tu registro.

✨ Para seguir usando CIO sin límites, activa el *Plan Premium*:
• 5 búsquedas/alertas por semana
• Sin límite de tiempo
• Acceso prioritario a nuevas funciones

🔗 *Enlace de pago:* https://checkout.wompi.co/l/TU_LINK_DE_PAGO

Una vez realices el pago, *ingresa el correo electrónico* que usaste para pagar y verificaremos tu suscripción automáticamente.`,

FREEMIUM_EXPIRED_ASK_EMAIL: `Para verificar tu pago, ingresa el *correo electrónico* que usaste para realizar el pago:`,

FREEMIUM_EXPIRED_RETURNING_USER: (name?: string) => `¡Hola${name ? ` ${name}` : ''}! 👋

Veo que ya agotaste tu período de prueba gratuita.

Para continuar usando CIO, necesitas activar el *Plan Premium*.

🔗 *Enlace de pago:* https://checkout.wompi.co/l/TU_LINK_DE_PAGO

Una vez realices el pago, ingresa el *correo electrónico* que usaste para pagar.`,

// === MENSAJES DE PAGO ===
PAYMENT_LINK: (email: string) => `✅ Hemos registrado tu correo: *${email}*

🔗 *Realiza tu pago aquí:* https://checkout.wompi.co/l/TU_LINK_DE_PAGO

💡 *Importante:* Usa el mismo correo (*${email}*) al momento de pagar para que podamos vincular tu cuenta automáticamente.

Una vez realizado el pago, escribe *"verificar"* y confirmaremos tu suscripción.`,

PAYMENT_NOT_FOUND: `😕 No encontramos un pago asociado a tu correo electrónico.

Verifica que:
1. Hayas completado el pago exitosamente
2. El correo que ingresaste sea el mismo que usaste para pagar

Si el problema persiste, escribe otro correo o contacta soporte.`,

PAYMENT_CONFIRMED: (name?: string) => `🎉 *¡Felicidades${name ? ` ${name}` : ''}!*

Tu pago ha sido *confirmado exitosamente*.

✨ Ya tienes acceso al *Plan Premium*:
• 5 búsquedas/alertas por semana
• Sin límite de tiempo
• Soporte prioritario

¿Qué te gustaría hacer?
• Escribe *"buscar"* para encontrar ofertas ahora`,

WAITING_PAYMENT_HELP: `💡 *¿Necesitas ayuda?*

• Escribe *"verificar"* para comprobar si tu pago fue procesado
• Escribe tu *correo electrónico* si quieres cambiarlo
• El enlace de pago es: https://checkout.wompi.co/l/TU_LINK_DE_PAGO`,

// === MENSAJES DE LÍMITES ===
PREMIUM_WEEKLY_LIMIT_REACHED: `⏳ Has alcanzado tu límite de 5 búsquedas/alertas esta semana.

Tus búsquedas se renovarán el próximo *lunes*.

Mientras tanto, puedes:
• Revisar las ofertas que ya te enviamos
• Editar tu perfil para mejores resultados la próxima semana`,

// === MENSAJES DE EMAIL ===
ERROR_EMAIL_INVALID: `Por favor, ingresa un correo electrónico válido.

Ejemplo: tu.email@ejemplo.com`,
```

---

## 🔄 FASE 7: Modificar Cancelación de Servicio

### 7.1 Cambiar comportamiento de `deleteUserCompletely`

**Archivo:** `apps/backend/src/modules/conversation/conversation.service.ts`

**Ubicación:** Línea ~1816 (`deleteUserCompletely`)

**Cambio:** NO eliminar el usuario, solo sus preferencias

```typescript
/**
 * "Cancela" el servicio: elimina preferencias pero mantiene datos de identidad y suscripción
 */
private async cancelUserService(userId: string) {
  // Eliminar UserProfile (preferencias de búsqueda)
  try {
    await this.prisma.userProfile.delete({ where: { userId } });
  } catch {
    // No existe, continuar
  }

  // Eliminar AlertPreference
  try {
    await this.prisma.alertPreference.delete({ where: { userId } });
  } catch {
    // No existe, continuar
  }

  // Eliminar búsquedas y trabajos enviados
  await this.prisma.jobSearchLog.deleteMany({ where: { userId } });
  await this.prisma.sentJob.deleteMany({ where: { userId } });

  // Resetear sesión a NEW
  await this.prisma.session.updateMany({
    where: { userId },
    data: { state: ConversationState.NEW, data: {}, updatedAt: new Date() },
  });

  // NO eliminar User ni Subscription
  // El usuario mantiene su identidad y estado de suscripción

  this.logger.log(`🗑️ Preferencias eliminadas para usuario ${userId} (usuario NO eliminado)`);
}
```

---

## ⚙️ FASE 8: Variables de Entorno

### 8.1 Agregar variables en `.env`

```env
# Wompi
WOMPI_PUBLIC_KEY=pub_test_xxxxx
WOMPI_PRIVATE_KEY=prv_test_xxxxx
WOMPI_EVENTS_SECRET=test_events_secret_xxxxx
WOMPI_PAYMENT_LINK=https://checkout.wompi.co/l/TU_LINK

# Admin
ADMIN_API_KEY=una_clave_segura_para_admin_api
```

---

## 🧪 FASE 9: Testeo Manual (Para Ti)

### 9.1 Usando el endpoint de admin

**Otorgar búsquedas a un usuario:**
```bash
curl -X POST https://tu-api.com/admin/users/USER_ID/grant-searches \
  -H "Content-Type: application/json" \
  -H "x-admin-key: TU_ADMIN_API_KEY" \
  -d '{"amount": 5, "reason": "Testing"}'
```

**Activar premium manualmente:**
```bash
curl -X POST https://tu-api.com/admin/users/USER_ID/activate-premium \
  -H "Content-Type: application/json" \
  -H "x-admin-key: TU_ADMIN_API_KEY" \
  -d '{"reason": "Testing", "durationDays": 30}'
```

### 9.2 Modificando directamente en BD (Prisma Studio)

```bash
cd apps/backend
npx prisma studio
```

Luego en la UI:
1. Ir a tabla `Subscription`
2. Buscar el registro del usuario
3. Modificar `plan` a `PREMIUM`
4. Modificar `premiumUsesLeft` al número deseado
5. Guardar

---

## 📋 Checklist de Implementación

### Base de Datos
- [ ] Agregar campos `name` y `email` a modelo User
- [ ] Crear modelo `Subscription`
- [ ] Crear modelo `Transaction`
- [ ] Crear enums `PlanType` y `SubscriptionStatus`
- [ ] Ejecutar migración

### Estados de Conversación
- [ ] Agregar estado `ASK_NAME`
- [ ] Agregar estado `FREEMIUM_EXPIRED`
- [ ] Agregar estado `ASK_EMAIL`
- [ ] Agregar estado `WAITING_PAYMENT`

### Handlers de Conversación
- [ ] Modificar `handleNewState` para verificar suscripción
- [ ] Crear `handleAskNameState`
- [ ] Crear `checkAndDeductUsage`
- [ ] Crear `handleFreemiumExpiredState`
- [ ] Crear `handleAskEmailState`
- [ ] Crear `handleWaitingPaymentState`
- [ ] Crear `activatePremiumForUser`
- [ ] Modificar `handleConfirmCancelServiceState` para usar `cancelUserService`

### Módulo de Pagos
- [ ] Crear carpeta `payment/`
- [ ] Crear `payment.controller.ts`
- [ ] Crear `payment.service.ts`
- [ ] Crear `dto/wompi-webhook.dto.ts`
- [ ] Crear `payment.module.ts`
- [ ] Registrar en `app.module.ts`

### Módulo de Admin
- [ ] Crear carpeta `admin/`
- [ ] Crear `admin.controller.ts`
- [ ] Crear `admin.service.ts`
- [ ] Crear `guards/admin.guard.ts`
- [ ] Crear `admin.module.ts`
- [ ] Registrar en `app.module.ts`

### Mensajes
- [ ] Agregar mensajes de nombre
- [ ] Agregar mensajes de freemium
- [ ] Agregar mensajes de pago
- [ ] Agregar mensajes de límites

### Variables de Entorno
- [ ] Agregar `WOMPI_PUBLIC_KEY`
- [ ] Agregar `WOMPI_PRIVATE_KEY`
- [ ] Agregar `WOMPI_EVENTS_SECRET`
- [ ] Agregar `WOMPI_PAYMENT_LINK`
- [ ] Agregar `ADMIN_API_KEY`

### Scheduler
- [ ] Modificar `runJobSearchAndNotifyUser` para verificar usos antes de ejecutar alerta

---

## 🔗 Diagrama de Flujo Actualizado

```
USUARIO NUEVO:
┌──────────────────────────────────────────────────────────────┐
│  NEW → ASK_NAME → ASK_DEVICE → ASK_TERMS → ... → READY      │
│         ↓                                                    │
│    (Crear Subscription freemium: 3 usos, 3 días)            │
└──────────────────────────────────────────────────────────────┘

USUARIO BUSCA (freemium):
┌──────────────────────────────────────────────────────────────┐
│  READY → checkUsage()                                        │
│          ↓                                                   │
│     ¿Usos > 0 Y días < 3?                                   │
│          ├── SÍ → Ejecutar búsqueda, deducir uso            │
│          └── NO → FREEMIUM_EXPIRED → ASK_EMAIL              │
└──────────────────────────────────────────────────────────────┘

USUARIO PAGA:
┌──────────────────────────────────────────────────────────────┐
│  1. Usuario paga en Wompi                                    │
│  2. Wompi envía webhook → /webhook/wompi                     │
│  3. Se guarda Transaction                                    │
│  4. Si email coincide con usuario → Activar premium          │
│  5. Si no → Esperar que usuario ingrese email                │
└──────────────────────────────────────────────────────────────┘

USUARIO QUE VUELVE (canceló servicio):
┌──────────────────────────────────────────────────────────────┐
│  NEW → checkSubscription()                                   │
│        ↓                                                     │
│   ¿Premium activo? → Bienvenida premium → READY             │
│   ¿Freemium expirado? → FREEMIUM_EXPIRED                    │
│   ¿Freemium activo? → Restaurar preferencias                │
└──────────────────────────────────────────────────────────────┘
```

---

## ❓ Respuestas a tus Preguntas

### 1. ¿Cómo asignar búsquedas manualmente?

**Opción A - Endpoint de admin:**
```bash
POST /admin/users/:userId/grant-searches
{
  "amount": 5,
  "reason": "Testing"
}
```

**Opción B - Prisma Studio:**
```bash
npx prisma studio
# Modificar subscription.premiumUsesLeft directamente
```

### 2. ¿Wompi funciona con webhooks?

**Sí.** Wompi envía eventos vía webhook cuando una transacción cambia de estado. El evento principal es `transaction.updated` con status `APPROVED`, `DECLINED`, etc.

**Configuración en Wompi:**
1. Ir a Panel de Wompi → Webhooks
2. Agregar URL: `https://tu-api.com/webhook/wompi`
3. Seleccionar eventos: `transaction.updated`
4. Copiar el `Events Secret` para verificar firmas

### 3. ¿Endpoint para empresas?

El endpoint `/admin/users/:id/activate-premium` permite activar premium a cualquier usuario manualmente, ideal para:
- Usuarios corporativos
- Promociones
- Testing
- Soporte

---

## 📌 Notas Importantes

1. **El enlace de pago de Wompi** (`WOMPI_PAYMENT_LINK`) debe crearse en el panel de Wompi como "Payment Link" con el precio fijo del plan premium.

2. **La verificación de firma del webhook** es crucial para seguridad. No procesar webhooks sin verificar.

3. **El scheduler también debe verificar usos** antes de enviar alertas programadas. Modificar `runJobSearchAndNotifyUser`.

4. **Los usos de premium se resetean semanalmente** (lunes). Implementar cron o verificar en cada uso.

5. **Email único**: Si dos usuarios ingresan el mismo email y hay un pago, el primero que lo verifique obtiene el premium.

---

¿Tienes alguna pregunta sobre alguna fase específica antes de comenzar la implementación?

