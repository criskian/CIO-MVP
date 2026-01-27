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
} from './dto/admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Controlador de administración
 *
 * Endpoints para gestión de usuarios y suscripciones.
 * PROTEGIDO: Requiere autenticación JWT Admin.
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
     * Lista todos los usuarios con paginación
     */
    @Get('users')
    async listUsers(
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20',
        @Query('search') search?: string,
    ) {
        this.logger.log(`📋 Listando usuarios (page: ${page}, limit: ${limit})`);
        return this.adminService.listUsers(
            parseInt(page, 10),
            parseInt(limit, 10),
            search,
        );
    }

    /**
     * GET /api/admin/users/:id
     * Obtiene un usuario por ID con todos sus datos
     */
    @Get('users/:id')
    async getUser(@Param('id') id: string) {
        this.logger.log(`👤 Obteniendo usuario: ${id}`);
        return this.adminService.getUserById(id);
    }

    /**
     * GET /api/admin/users/phone/:phone
     * Obtiene un usuario por teléfono
     */
    @Get('users/phone/:phone')
    async getUserByPhone(@Param('phone') phone: string) {
        this.logger.log(`📱 Obteniendo usuario por teléfono: ${phone}`);
        return this.adminService.getUserByPhone(phone);
    }

    /**
     * POST /api/admin/users
     * Crea un nuevo usuario (admin)
     */
    @Post('users')
    @HttpCode(HttpStatus.CREATED)
    async createUser(@Body() dto: CreateUserDto) {
        this.logger.log(`➕ Creando usuario: ${dto.phone}`);
        return this.adminService.createUser(dto);
    }

    /**
     * PUT /api/admin/users/:id
     * Actualiza datos de un usuario
     */
    @Put('users/:id')
    async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
        this.logger.log(`✏️ Actualizando usuario: ${id}`);
        return this.adminService.updateUser(id, dto);
    }

    /**
     * DELETE /api/admin/users/:id
     * Elimina un usuario completamente
     */
    @Delete('users/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteUser(@Param('id') id: string) {
        this.logger.log(`🗑️ Eliminando usuario: ${id}`);
        return this.adminService.deleteUser(id);
    }

    /**
     * DELETE /api/admin/users/phone/:phone
     * Elimina un usuario por teléfono
     */
    @Delete('users/phone/:phone')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteUserByPhone(@Param('phone') phone: string) {
        this.logger.log(`🗑️ Eliminando usuario por teléfono: ${phone}`);
        return this.adminService.deleteUserByPhone(phone);
    }

    // ==============================
    // SUSCRIPCIONES
    // ==============================

    /**
     * GET /api/admin/subscriptions/:userId
     * Obtiene la suscripción de un usuario
     */
    @Get('subscriptions/:userId')
    async getSubscription(@Param('userId') userId: string) {
        this.logger.log(`💳 Obteniendo suscripción de usuario: ${userId}`);
        return this.adminService.getSubscription(userId);
    }

    /**
     * PUT /api/admin/subscriptions/:userId
     * Actualiza/modifica la suscripción de un usuario
     */
    @Put('subscriptions/:userId')
    async updateSubscription(
        @Param('userId') userId: string,
        @Body() dto: UpdateSubscriptionDto,
    ) {
        this.logger.log(`✏️ Actualizando suscripción de usuario: ${userId}`);
        return this.adminService.updateSubscription(userId, dto);
    }

    /**
     * POST /api/admin/subscriptions/:userId/activate-premium
     * Activa premium manualmente para un usuario
     */
    @Post('subscriptions/:userId/activate-premium')
    async activatePremium(@Param('userId') userId: string) {
        this.logger.log(`👑 Activando premium para usuario: ${userId}`);
        return this.adminService.activatePremium(userId);
    }

    /**
     * POST /api/admin/subscriptions/:userId/reset-freemium
     * Reinicia el freemium de un usuario (3 usos, 3 días)
     */
    @Post('subscriptions/:userId/reset-freemium')
    async resetFreemium(@Param('userId') userId: string) {
        this.logger.log(`🔄 Reiniciando freemium para usuario: ${userId}`);
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
        this.logger.log(`📊 Obteniendo sesiones de usuario: ${userId}`);
        return this.adminService.getUserSessions(userId);
    }

    /**
     * DELETE /api/admin/sessions/:userId
     * Elimina las sesiones de un usuario (reinicia estado)
     */
    @Delete('sessions/:userId')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteSessions(@Param('userId') userId: string) {
        this.logger.log(`🗑️ Eliminando sesiones de usuario: ${userId}`);
        return this.adminService.deleteUserSessions(userId);
    }

    // ==============================
    // ESTADÍSTICAS
    // ==============================

    /**
     * GET /api/admin/stats
     * Obtiene estadísticas generales
     */
    @Get('stats')
    async getStats() {
        this.logger.log(`📈 Obteniendo estadísticas`);
        return this.adminService.getStats();
    }

    /**
     * GET /api/admin/stats/detailed
     * Obtiene estadísticas detalladas con filtros de fecha
     * Query: startDate, endDate (ISO strings)
     */
    @Get('stats/detailed')
    async getDetailedStats(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        this.logger.log(`📊 Obteniendo estadísticas detalladas`);
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
        this.logger.log(`📋 Obteniendo actividad reciente`);
        return this.adminService.getRecentActivity(limit ? parseInt(limit) : 10);
    }

    // ==============================
    // TEST (TEMPORAL)
    // ==============================

    /**
     * POST /api/admin/test/template
     * [TEMPORAL] Envía un template de prueba para verificar integración con Meta
     * Body: { phone: string, name?: string, jobCount?: string, role?: string }
     */
    @Post('test/template')
    async testTemplate(@Body() body: { phone: string; name?: string; jobCount?: string; role?: string }) {
        this.logger.log(`🧪 Enviando template de prueba a: ${body.phone}`);

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
}
