import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Query,
    HttpCode,
    HttpStatus,
    Logger,
    UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import {
    UpdateUserDto,
    UpdateSubscriptionDto,
    CreateUserDto,
    CreateEmailTemplateDto,
    UpdateEmailTemplateDto,
    CreateEmailCampaignDto,
    UpdateEmailCampaignDto,
    SendWhatsAppTemplateDto,
} from './dto/admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Controlador de administraciÃ³n
 *
 * Endpoints para gestiÃ³n de usuarios y suscripciones.
 * PROTEGIDO: Requiere autenticaciÃ³n JWT Admin.
 */
@Controller('api/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
    private readonly logger = new Logger(AdminController.name);

    constructor(private readonly adminService: AdminService) { }

    // ==============================
    // USUARIOS
    // ==============================

    /**
     * GET /api/admin/users
     * Lista todos los usuarios con paginaciÃ³n
     */
    @Get('users')
    async listUsers(
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20',
        @Query('search') search?: string,
        @Query('plan') plan?: string,
        @Query('status') status?: string,
        @Query('hasAlerts') hasAlerts?: string,
        @Query('freemiumExpired') freemiumExpired?: string,
        @Query('searchesUsed') searchesUsed?: string,
    ) {
        this.logger.log(`Listando usuarios (page: ${page}, limit: ${limit})`);
        return this.adminService.listUsers(
            parseInt(page, 10),
            parseInt(limit, 10),
            search,
            { plan, status, hasAlerts, freemiumExpired, searchesUsed },
        );
    }

    /**
     * GET /api/admin/users/export
     * Obtiene todos los usuarios para exportaciÃ³n CSV (sin paginaciÃ³n)
     */
    @Get('users/export')
    async getAllUsersForExport() {
        this.logger.log(`Exportando todos los usuarios para CSV`);
        return this.adminService.getAllUsersForExport();
    }

    /**
     * GET /api/admin/users/:id
     * Obtiene un usuario por ID con todos sus datos
     */
    @Get('users/:id')
    async getUser(@Param('id') id: string) {
        this.logger.log(`Obteniendo usuario: ${id}`);
        return this.adminService.getUserById(id);
    }

    /**
     * GET /api/admin/users/phone/:phone
     * Obtiene un usuario por telÃ©fono
     */
    @Get('users/phone/:phone')
    async getUserByPhone(@Param('phone') phone: string) {
        this.logger.log(`Obteniendo usuario por telefono: ${phone}`);
        return this.adminService.getUserByPhone(phone);
    }

    /**
     * POST /api/admin/users
     * Crea un nuevo usuario (admin)
     */
    @Post('users')
    @HttpCode(HttpStatus.CREATED)
    async createUser(@Body() dto: CreateUserDto) {
        this.logger.log(`Creando usuario: ${dto.phone}`);
        return this.adminService.createUser(dto);
    }

    /**
     * PUT /api/admin/users/:id
     * Actualiza datos de un usuario
     */
    @Put('users/:id')
    async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
        this.logger.log(`Actualizando usuario: ${id}`);
        return this.adminService.updateUser(id, dto);
    }

    /**
     * DELETE /api/admin/users/:id
     * Elimina un usuario completamente
     */
    @Delete('users/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteUser(@Param('id') id: string) {
        this.logger.log(`Eliminando usuario: ${id}`);
        return this.adminService.deleteUser(id);
    }

    /**
     * DELETE /api/admin/users/phone/:phone
     * Elimina un usuario por telÃ©fono
     */
    @Delete('users/phone/:phone')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteUserByPhone(@Param('phone') phone: string) {
        this.logger.log(`Eliminando usuario por telefono: ${phone}`);
        return this.adminService.deleteUserByPhone(phone);
    }

    // ==============================
    // SUSCRIPCIONES
    // ==============================

    /**
     * GET /api/admin/subscriptions/:userId
     * Obtiene la suscripciÃ³n de un usuario
     */
    @Get('subscriptions/:userId')
    async getSubscription(@Param('userId') userId: string) {
        this.logger.log(`Obteniendo suscripcion de usuario: ${userId}`);
        return this.adminService.getSubscription(userId);
    }

    /**
     * PUT /api/admin/subscriptions/:userId
     * Actualiza/modifica la suscripciÃ³n de un usuario
     */
    @Put('subscriptions/:userId')
    async updateSubscription(
        @Param('userId') userId: string,
        @Body() dto: UpdateSubscriptionDto,
    ) {
        this.logger.log(`Actualizando suscripcion de usuario: ${userId}`);
        return this.adminService.updateSubscription(userId, dto);
    }

    /**
     * POST /api/admin/subscriptions/:userId/activate-premium
     * Activa premium manualmente para un usuario
     */
    @Post('subscriptions/:userId/activate-premium')
    async activatePremium(@Param('userId') userId: string) {
        this.logger.log(`Activando premium para usuario: ${userId}`);
        return this.adminService.activatePremium(userId);
    }

    /**
     * POST /api/admin/subscriptions/:userId/activate-pro
     * Activa plan PRO manualmente para un usuario (90 dÃ­as)
     */
    @Post('subscriptions/:userId/activate-pro')
    async activatePro(@Param('userId') userId: string) {
        this.logger.log(`Activando PRO para usuario: ${userId}`);
        return this.adminService.activatePro(userId);
    }

    /**
     * POST /api/admin/subscriptions/:userId/reset-freemium
     * Reinicia el freemium de un usuario (3 usos, 3 dÃ­as)
     */
    @Post('subscriptions/:userId/reset-freemium')
    async resetFreemium(@Param('userId') userId: string) {
        this.logger.log(`Reiniciando freemium para usuario: ${userId}`);
        return this.adminService.resetFreemium(userId);
    }

    // ==============================
    // SESIONES
    // ==============================

    /**
     * GET /api/admin/sessions/:userId
     * Obtiene las sesiones de un usuario
     */
    @Get('sessions/:userId')
    async getSessions(@Param('userId') userId: string) {
        this.logger.log(`Obteniendo sesiones de usuario: ${userId}`);
        return this.adminService.getUserSessions(userId);
    }

    /**
     * DELETE /api/admin/sessions/:userId
     * Elimina las sesiones de un usuario (reinicia estado)
     */
    @Delete('sessions/:userId')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteSessions(@Param('userId') userId: string) {
        this.logger.log(`Eliminando sesiones de usuario: ${userId}`);
        return this.adminService.deleteUserSessions(userId);
    }

    // ==============================
    // ESTADÃSTICAS
    // ==============================

    /**
     * GET /api/admin/stats
     * Obtiene estadÃ­sticas generales
     */
    @Get('stats')
    async getStats() {
        this.logger.log(`Obteniendo estadisticas`);
        return this.adminService.getStats();
    }

    /**
     * GET /api/admin/stats/detailed
     * Obtiene estadÃ­sticas detalladas con filtros de fecha
     * Query: startDate, endDate (ISO strings)
     */
    @Get('stats/detailed')
    async getDetailedStats(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        this.logger.log(`Obteniendo estadisticas detalladas`);
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return this.adminService.getDetailedStats(start, end);
    }

    /**
     * GET /api/admin/activity/recent
     * Obtiene actividad reciente (usuarios y pagos)
     * Query: limit (number, default 10)
     */
    @Get('activity/recent')
    async getRecentActivity(@Query('limit') limit?: string) {
        this.logger.log(`Obteniendo actividad reciente`);
        return this.adminService.getRecentActivity(limit ? parseInt(limit) : 10);
    }

    // ==============================
    // EMAILS
    // ==============================

    @Get('emails/templates')
    async listEmailTemplates() {
        this.logger.log('Listando plantillas de email');
        return this.adminService.listEmailTemplates();
    }

    @Post('emails/templates')
    async createEmailTemplate(@Body() dto: CreateEmailTemplateDto) {
        this.logger.log(`Creando plantilla de email: ${dto.slug}`);
        return this.adminService.createEmailTemplate(dto);
    }

    @Put('emails/templates/:id')
    async updateEmailTemplate(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
        this.logger.log(`Actualizando plantilla de email: ${id}`);
        return this.adminService.updateEmailTemplate(id, dto);
    }

    @Delete('emails/templates/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteEmailTemplate(@Param('id') id: string) {
        this.logger.log(`Eliminando plantilla de email: ${id}`);
        await this.adminService.deleteEmailTemplate(id);
    }

    @Get('emails/lists')
    async getEmailLists() {
        this.logger.log('Obteniendo listas de destinatarios');
        return this.adminService.getEmailLists();
    }

    @Get('emails/campaigns')
    async listEmailCampaigns(
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20',
    ) {
        this.logger.log(`Listando campañas de email (page: ${page}, limit: ${limit})`);
        return this.adminService.listEmailCampaigns(parseInt(page, 10), parseInt(limit, 10));
    }

    @Post('emails/campaigns')
    async createEmailCampaign(@Body() dto: CreateEmailCampaignDto) {
        this.logger.log(`Creando campaña de email: ${dto.name}`);
        return this.adminService.createEmailCampaign(dto);
    }

    @Put('emails/campaigns/:id')
    async updateEmailCampaign(@Param('id') id: string, @Body() dto: UpdateEmailCampaignDto) {
        this.logger.log(`Actualizando campaña de email: ${id}`);
        return this.adminService.updateEmailCampaign(id, dto);
    }

    @Delete('emails/campaigns/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteEmailCampaign(@Param('id') id: string) {
        this.logger.log(`Eliminando campaña de email: ${id}`);
        await this.adminService.deleteEmailCampaign(id);
    }

    @Post('emails/campaigns/:id/send')
    async sendEmailCampaign(@Param('id') id: string) {
        this.logger.log(`Enviando campaña de email: ${id}`);
        return this.adminService.sendEmailCampaign(id);
    }

    @Get('emails/sent')
    async listSentEmails(
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20',
        @Query('search') search?: string,
    ) {
        this.logger.log(`Listando correos enviados (page: ${page}, limit: ${limit})`);
        return this.adminService.listSentEmails(
            parseInt(page, 10),
            parseInt(limit, 10),
            search,
        );
    }
    // ==============================
    // TEST (TEMPORAL)
    // ==============================

    /**
     * POST /api/admin/test/template
     * [TEMPORAL] EnvÃ­a un template de prueba para verificar integraciÃ³n con Meta
     * Body: { phone: string, name?: string, jobCount?: string, role?: string }
     */
    @Post('test/template')
    async testTemplate(@Body() body: { phone: string; name?: string; jobCount?: string; role?: string }) {
        this.logger.log(`Enviando template de prueba a: ${body.phone}`);

        const name = body.name || 'Usuario de prueba';
        const jobCount = body.jobCount || '5';
        const role = body.role || 'Desarrollador';

        await this.adminService.sendTestTemplate(body.phone, name, jobCount, role);

        return {
            success: true,
            message: `Template enviado a ${body.phone}`,
            params: { name, jobCount, role }
        };
    }

    /**
     * POST /api/admin/templates/whatsapp/send
     * Envía una template de WhatsApp a un usuario puntual seleccionado en admin.
     */
    @Post('templates/whatsapp/send')
    async sendWhatsAppTemplate(@Body() dto: SendWhatsAppTemplateDto) {
        this.logger.log(`Enviando template WhatsApp desde admin a userId=${dto.userId}`);
        return this.adminService.sendWhatsAppTemplateToUser(dto);
    }
}

