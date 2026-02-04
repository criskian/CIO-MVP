import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { CloudApiProvider } from './providers/cloud-api.provider';
import { ConversationModule } from '../conversation/conversation.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [ConversationModule, DatabaseModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, CloudApiProvider],
  exports: [WhatsappService],
})
export class WhatsappModule { }

