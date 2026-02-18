import { Controller, Post, Get, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Post('test-email')
    async sendTestEmail(@Body('email') email: string, @Body('name') name: string) {
        return await this.notificationsService.sendWelcomeEmail(email, name || 'Usuario');
    }

    @Get('preview')
    getPreview() {
        return this.notificationsService.getWelcomeEmailHtml('Usuario de Prueba');
    }
}
