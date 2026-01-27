import {
    Injectable,
    Logger,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
    UpdateUserDto,
    UpdateSubscriptionDto,
    CreateUserDto,
} from './dto/admin.dto';

/**
 * Servicio de administración
 * Maneja operaciones CRUD para usuarios y suscripciones
 */
@Injectable()
export class AdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly whatsappService: WhatsappService,
    ) { }

    // ==============================
    // USUARIOS
    // ==============================

    /**
     * Lista usuarios con paginación
     */
    async listUsers(page: number = 1, limit: number = 20, search?: string) {
        const skip = (page - 1) * limit;

        const where = search
            ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' as const } },
                    { email: { contains: search, mode: 'insensitive' as const } },
                    { phone: { contains: search } },
                ],
            }
            : {};

        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                include: {
                    subscription: true,
                    profile: true,
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.user.count({ where }),
        ]);

        return {
            users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Obtiene usuario por ID
     */
    async getUserById(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: {
                subscription: true,
                profile: true,
                alert: true,
                sessions: { orderBy: { createdAt: 'desc' }, take: 5 },
            },
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        return user;
    }

    /**
     * Obtiene usuario por teléfono
     */
    async getUserByPhone(phone: string) {
        const user = await this.prisma.user.findUnique({
            where: { phone },
            include: {
                subscription: true,
                profile: true,
                alert: true,
            },
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        return user;
    }

    /**
     * Crea un nuevo usuario (admin)
     */
    async createUser(dto: CreateUserDto) {
        // Verificar si existe
        const existing = await this.prisma.user.findFirst({
            where: {
                OR: [{ phone: dto.phone }, { email: dto.email?.toLowerCase() }],
            },
        });

        if (existing) {
            throw new ConflictException('El teléfono o email ya está registrado');
        }

        const user = await this.prisma.user.create({
            data: {
                phone: dto.phone,
                name: dto.name,
                email: dto.email?.toLowerCase(),
                subscription: dto.createSubscription
                    ? {
                        create: {
                            plan: dto.plan || 'FREEMIUM',
                            freemiumUsesLeft: dto.plan === 'PREMIUM' ? 0 : 3,
                            freemiumStartDate: new Date(),
                            freemiumExpired: false,
                            premiumUsesLeft: dto.plan === 'PREMIUM' ? 5 : 0,
                            premiumWeekStart: dto.plan === 'PREMIUM' ? new Date() : null,
                            status: 'ACTIVE',
                        },
                    }
                    : undefined,
            },
            include: { subscription: true },
        });

        this.logger.log(`✅ Usuario creado por admin: ${user.phone}`);
        return user;
    }

    /**
     * Actualiza datos de un usuario
     */
    async updateUser(id: string, dto: UpdateUserDto) {
        const user = await this.prisma.user.findUnique({ where: { id } });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        const updated = await this.prisma.user.update({
            where: { id },
            data: {
                name: dto.name,
                email: dto.email?.toLowerCase(),
                phone: dto.phone,
            },
            include: { subscription: true },
        });

        this.logger.log(`✏️ Usuario actualizado: ${id}`);
        return updated;
    }

    /**
     * Elimina un usuario completamente (cascada)
     */
    async deleteUser(id: string) {
        const user = await this.prisma.user.findUnique({ where: { id } });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        // Eliminar en orden para evitar conflictos de FK
        await this.prisma.$transaction([
            this.prisma.sentJob.deleteMany({ where: { userId: id } }),
            this.prisma.jobSearchLog.deleteMany({ where: { userId: id } }),
            this.prisma.alertPreference.deleteMany({ where: { userId: id } }),
            this.prisma.userProfile.deleteMany({ where: { userId: id } }),
            this.prisma.session.deleteMany({ where: { userId: id } }),
            this.prisma.transaction.deleteMany({ where: { userId: id } }),
            this.prisma.subscription.deleteMany({ where: { userId: id } }),
            this.prisma.user.delete({ where: { id } }),
        ]);

        this.logger.log(`🗑️ Usuario eliminado completamente: ${id}`);
        return { deleted: true };
    }

    /**
     * Elimina usuario por teléfono
     */
    async deleteUserByPhone(phone: string) {
        const user = await this.prisma.user.findUnique({ where: { phone } });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        return this.deleteUser(user.id);
    }

    // ==============================
    // SUSCRIPCIONES
    // ==============================

    /**
     * Obtiene suscripción de un usuario
     */
    async getSubscription(userId: string) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { userId },
            include: { user: { select: { name: true, phone: true, email: true } } },
        });

        if (!subscription) {
            throw new NotFoundException('Suscripción no encontrada');
        }

        return subscription;
    }

    /**
     * Actualiza suscripción
     */
    async updateSubscription(userId: string, dto: UpdateSubscriptionDto) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { userId },
        });

        if (!subscription) {
            // Crear si no existe
            return this.prisma.subscription.create({
                data: {
                    userId,
                    plan: dto.plan || 'FREEMIUM',
                    status: dto.status || 'ACTIVE',
                    freemiumUsesLeft: dto.freemiumUsesLeft ?? 3,
                    freemiumStartDate: new Date(),
                    freemiumExpired: dto.freemiumExpired ?? false,
                    premiumUsesLeft: dto.premiumUsesLeft ?? 0,
                    premiumWeekStart: dto.premiumWeekStart,
                },
            });
        }

        return this.prisma.subscription.update({
            where: { userId },
            data: {
                plan: dto.plan,
                status: dto.status,
                freemiumUsesLeft: dto.freemiumUsesLeft,
                freemiumExpired: dto.freemiumExpired,
                premiumUsesLeft: dto.premiumUsesLeft,
                premiumWeekStart: dto.premiumWeekStart,
                premiumStartDate: dto.premiumStartDate,
                premiumEndDate: dto.premiumEndDate,
            },
        });
    }

    /**
     * Activa premium manualmente
     */
    async activatePremium(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('Usuario no encontrado');

        const now = new Date();
        const premiumEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const subscription = await this.prisma.subscription.upsert({
            where: { userId },
            update: {
                plan: 'PREMIUM',
                status: 'ACTIVE',
                premiumStartDate: now,
                premiumEndDate: premiumEndDate,
                premiumUsesLeft: 5,
                premiumWeekStart: now, // Semana empieza desde activación
                freemiumExpired: true,
            },
            create: {
                userId,
                plan: 'PREMIUM',
                status: 'ACTIVE',
                premiumStartDate: now,
                premiumEndDate: premiumEndDate,
                premiumUsesLeft: 5,
                premiumWeekStart: now, // Semana empieza desde activación
                freemiumUsesLeft: 0,
                freemiumStartDate: now,
                freemiumExpired: true,
            },
        });

        // Reactivar alertas si el usuario las tenía configuradas
        const alertPref = await this.prisma.alertPreference.findUnique({
            where: { userId }
        });

        if (alertPref && !alertPref.enabled) {
            await this.prisma.alertPreference.update({
                where: { userId },
                data: { enabled: true }
            });
            this.logger.log(`🔔 Alertas reactivadas para usuario ${userId}`);
        }

        this.logger.log(`👑 Premium activado para usuario: ${userId} (expira: ${premiumEndDate.toISOString()})`);
        return subscription;
    }

    /**
     * Reinicia freemium
     */
    async resetFreemium(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('Usuario no encontrado');

        const subscription = await this.prisma.subscription.upsert({
            where: { userId },
            update: {
                plan: 'FREEMIUM',
                status: 'ACTIVE',
                freemiumUsesLeft: 3,
                freemiumStartDate: new Date(),
                freemiumExpired: false,
            },
            create: {
                userId,
                plan: 'FREEMIUM',
                status: 'ACTIVE',
                freemiumUsesLeft: 3,
                freemiumStartDate: new Date(),
                freemiumExpired: false,
            },
        });

        this.logger.log(`🔄 Freemium reiniciado para usuario: ${userId}`);
        return subscription;
    }

    // ==============================
    // SESIONES
    // ==============================

    async getUserSessions(userId: string) {
        return this.prisma.session.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async deleteUserSessions(userId: string) {
        await this.prisma.session.deleteMany({ where: { userId } });
        this.logger.log(`🗑️ Sesiones eliminadas para usuario: ${userId}`);
        return { deleted: true };
    }

    // ==============================
    // ESTADÍSTICAS
    // ==============================

    async getStats() {
        const [
            totalUsers,
            freemiumUsers,
            premiumUsers,
            expiredUsers,
            recentUsers,
        ] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.subscription.count({
                where: { plan: 'FREEMIUM', freemiumExpired: false },
            }),
            this.prisma.subscription.count({ where: { plan: 'PREMIUM' } }),
            this.prisma.subscription.count({ where: { freemiumExpired: true } }),
            this.prisma.user.count({
                where: {
                    createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                },
            }),
        ]);

        return {
            totalUsers,
            freemiumUsers,
            premiumUsers,
            expiredUsers,
            recentUsers,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Obtiene estadísticas detalladas con filtros de fecha
     */
    async getDetailedStats(startDate?: Date, endDate?: Date) {
        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Últimos 30 días por defecto
        const end = endDate || new Date();

        const [
            // Conteos básicos
            totalUsers,
            freemiumActive,
            premiumActive,
            freemiumExpired,
            
            // Conteos en el período
            newUsersInPeriod,
            conversionsInPeriod,
            paymentsInPeriod,
            
            // Actividad
            usersWithSearches,
            totalJobsSent,
            
            // Ingresos
            totalRevenue,
        ] = await Promise.all([
            // Total usuarios
            this.prisma.user.count(),
            
            // Freemium activos
            this.prisma.subscription.count({
                where: { plan: 'FREEMIUM', freemiumExpired: false },
            }),
            
            // Premium activos
            this.prisma.subscription.count({
                where: { plan: 'PREMIUM', status: 'ACTIVE' },
            }),
            
            // Freemium expirados
            this.prisma.subscription.count({
                where: { freemiumExpired: true },
            }),
            
            // Nuevos usuarios en el período
            this.prisma.user.count({
                where: { createdAt: { gte: start, lte: end } },
            }),
            
            // Conversiones a premium en el período
            this.prisma.subscription.count({
                where: {
                    plan: 'PREMIUM',
                    premiumStartDate: { gte: start, lte: end },
                },
            }),
            
            // Pagos en el período
            this.prisma.transaction.count({
                where: {
                    wompiStatus: 'APPROVED',
                    createdAt: { gte: start, lte: end },
                },
            }),
            
            // Usuarios que han buscado (tienen perfil)
            this.prisma.userProfile.count(),
            
            // Total de ofertas enviadas
            this.prisma.sentJob.count(),
            
            // Ingresos totales (transacciones aprobadas)
            this.prisma.transaction.aggregate({
                where: { wompiStatus: 'APPROVED' },
                _sum: { amount: true },
            }),
        ]);

        // Calcular tasa de conversión
        const conversionRate = totalUsers > 0 
            ? ((premiumActive / totalUsers) * 100).toFixed(1) 
            : '0';

        // Obtener series de tiempo para gráficos (últimos 30 días)
        const dailyStats = await this.getDailyStats(start, end);

        return {
            summary: {
                totalUsers,
                freemiumActive,
                premiumActive,
                freemiumExpired,
                conversionRate: parseFloat(conversionRate),
                totalRevenue: totalRevenue._sum.amount || 0,
                totalJobsSent,
                usersWithSearches,
            },
            period: {
                startDate: start.toISOString(),
                endDate: end.toISOString(),
                newUsers: newUsersInPeriod,
                conversions: conversionsInPeriod,
                payments: paymentsInPeriod,
            },
            dailyStats,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Obtiene estadísticas diarias para gráficos
     */
    private async getDailyStats(start: Date, end: Date) {
        const days: { date: string; registros: number; conversiones: number; pagos: number }[] = [];
        
        // Iterar por cada día en el rango
        const currentDate = new Date(start);
        while (currentDate <= end) {
            const dayStart = new Date(currentDate);
            dayStart.setHours(0, 0, 0, 0);
            
            const dayEnd = new Date(currentDate);
            dayEnd.setHours(23, 59, 59, 999);

            const [registros, conversiones, pagos] = await Promise.all([
                this.prisma.user.count({
                    where: { createdAt: { gte: dayStart, lte: dayEnd } },
                }),
                this.prisma.subscription.count({
                    where: {
                        plan: 'PREMIUM',
                        premiumStartDate: { gte: dayStart, lte: dayEnd },
                    },
                }),
                this.prisma.transaction.count({
                    where: {
                        wompiStatus: 'APPROVED',
                        createdAt: { gte: dayStart, lte: dayEnd },
                    },
                }),
            ]);

            days.push({
                date: dayStart.toISOString().split('T')[0],
                registros,
                conversiones,
                pagos,
            });

            currentDate.setDate(currentDate.getDate() + 1);
        }

        return days;
    }

    /**
     * Obtiene los usuarios más recientes
     */
    async getRecentActivity(limit = 10) {
        const [recentUsers, recentPayments] = await Promise.all([
            this.prisma.user.findMany({
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    createdAt: true,
                    subscription: {
                        select: { plan: true, status: true },
                    },
                },
            }),
            this.prisma.transaction.findMany({
                take: limit,
                where: { wompiStatus: 'APPROVED' },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    amount: true,
                    createdAt: true,
                    user: {
                        select: { name: true, phone: true },
                    },
                },
            }),
        ]);

        return { recentUsers, recentPayments };
    }

    // ==============================
    // HELPERS
    // ==============================

    private getWeekStart(date: Date): Date {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // ==============================
    // TEST (TEMPORAL)
    // ==============================

    /**
     * [TEMPORAL] Envía un template de prueba para verificar integración
     */
    async sendTestTemplate(
        phone: string,
        name: string,
        jobCount: string,
        role: string,
    ): Promise<void> {
        this.logger.log(`🧪 Enviando template de prueba a ${phone}`);

        await this.whatsappService.sendTemplateMessage(
            phone,
            'job_alert_notification',
            'es_CO',
            [name, jobCount, role]
        );

        this.logger.log(`✅ Template de prueba enviado a ${phone}`);
    }
}
