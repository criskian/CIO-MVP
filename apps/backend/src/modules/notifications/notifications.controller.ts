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

    @Post('test-onboarding')
    async sendTestOnboardingEmail(@Body('email') email: string, @Body('name') name: string) {
        return await this.notificationsService.sendOnboardingEmail(email, name || 'Usuario');
    }

    @Get('preview-onboarding')
    getOnboardingPreview() {
        return this.notificationsService.getOnboardingEmailHtml('Usuario de Prueba');
    }

    @Post('test-profile-update')
    async sendTestProfileUpdateEmail(@Body('email') email: string, @Body('name') name: string) {
        return await this.notificationsService.sendProfileUpdateEmail(email, name || 'Usuario');
    }

    @Get('preview-profile-update')
    getProfileUpdatePreview() {
        return this.notificationsService.getProfileUpdateEmailHtml('Usuario de Prueba');
    }
}
