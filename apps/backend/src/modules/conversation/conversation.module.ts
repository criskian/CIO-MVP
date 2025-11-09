import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { JobSearchModule } from '../job-search/job-search.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [JobSearchModule, LlmModule],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}

