import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../database/prisma.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [WhatsappModule, NotificationsModule],
    controllers: [AdminController],
    providers: [AdminService, PrismaService],
    exports: [AdminService],
})
export class AdminModule { }
