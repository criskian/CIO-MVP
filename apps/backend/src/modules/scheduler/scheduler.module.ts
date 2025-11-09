import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JobSearchModule } from '../job-search/job-search.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [JobSearchModule, WhatsappModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}

