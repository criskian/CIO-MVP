import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JobSearchModule } from '../job-search/job-search.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { DatabaseModule } from '../database/database.module';
import { AdminModule } from '../admin/admin.module';
import { ConversationModule } from '../conversation/conversation.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, JobSearchModule, WhatsappModule, AdminModule, ConversationModule, NotificationsModule],
  providers: [SchedulerService],
  exports: [SchedulerService], // Exportar para usar en ConversationModule si se necesita
})
export class SchedulerModule {}
