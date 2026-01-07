import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ChatHistoryService } from './chat-history.service';
import { ChatHistoryController } from './chat-history.controller';
import { DatabaseModule } from '../database/database.module';
import { JobSearchModule } from '../job-search/job-search.module';
import { LlmModule } from '../llm/llm.module';
import { CvModule } from '../cv/cv.module';

@Module({
  imports: [DatabaseModule, JobSearchModule, LlmModule, CvModule],
  controllers: [ChatHistoryController],
  providers: [ConversationService, ChatHistoryService],
  exports: [ConversationService, ChatHistoryService],
})
export class ConversationModule {}
