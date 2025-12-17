import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { DatabaseModule } from './modules/database/database.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { JobSearchModule } from './modules/job-search/job-search.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { LlmModule } from './modules/llm/llm.module';
import { CvModule } from './modules/cv/cv.module';
import { RegistrationModule } from './modules/registration/registration.module';
import { AdminModule } from './modules/admin/admin.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 300,
      },
    ]),
    DatabaseModule,
    WhatsappModule,
    ConversationModule,
    JobSearchModule,
    SchedulerModule,
    LlmModule,
    CvModule,
    RegistrationModule,
    AdminModule,
    PaymentModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }

