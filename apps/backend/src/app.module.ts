import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './modules/database/database.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { JobSearchModule } from './modules/job-search/job-search.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { LlmModule } from './modules/llm/llm.module';
import { CvModule } from './modules/cv/cv.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    WhatsappModule,
    ConversationModule,
    JobSearchModule,
    SchedulerModule,
    LlmModule,
    CvModule,
  ],
})
export class AppModule {}
