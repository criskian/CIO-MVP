import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { DatabaseModule } from '../database/database.module';
import { JobSearchModule } from '../job-search/job-search.module';
import { LlmModule } from '../llm/llm.module';
import { CvModule } from '../cv/cv.module';

@Module({
  imports: [DatabaseModule, JobSearchModule, LlmModule, CvModule],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
