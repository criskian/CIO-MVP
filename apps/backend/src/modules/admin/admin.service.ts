import {
    Injectable,
    Logger,
    NotFoundException,
    ConflictException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { countBusinessDays } from '../conversation/helpers/date-utils';
import {
    UpdateUserDto,
    UpdateSubscriptionDto,
    CreateUserDto,
    CreateEmailTemplateDto,
    UpdateEmailTemplateDto,
    CreateEmailCampaignDto,
    UpdateEmailCampaignDto,
} from './dto/admin.dto';

/**
 * Servicio de administraciÃ³n
 * Maneja operaciones CRUD para usuarios y suscripciones
 */
@Injectable()
export class AdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly whatsappService: WhatsappService,
        private readonly notificationsService: NotificationsService,
    ) { }

    // ==============================
    // USUARIOS
    // ==============================

    /**
     * Lista usuarios con paginaciÃ³n y filtros
     */
    async listUsers(
        page: number = 1,
        limit: number = 20,
        search?: string,
        filters?: {
            plan?: string;
            status?: string;
            hasAlerts?: string;
            freemiumExpired?: string;
            searchesUsed?: string;
        },
    ) {
        await this.syncFreemiumExpirationStatus();

        const skip = (page - 1) * limit;

        // Construir filtro de bÃºsqueda de texto
        const searchCondition = search
            ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' as const } },
                    { email: { contains: search, mode: 'insensitive' as const } },
                    { phone: { contains: search } },
                ],
            }
            : {};

        // Construir filtros adicionales
        const filterConditions: any[] = [];

        if (filters?.plan) {
            filterConditions.push({
                subscription: { plan: filters.plan },
            });
        }

        if (filters?.status) {
            filterConditions.push({
                subscription: { status: filters.status },
            });
        }

        if (filters?.hasAlerts === 'true') {
            filterConditions.push({
                alert: { isNot: null },
            });
        } else if (filters?.hasAlerts === 'false') {
            filterConditions.push({
                alert: null,
            });
        }

        if (filters?.freemiumExpired === 'true') {
            filterConditions.push({
                subscription: { freemiumExpired: true },
            });
        } else if (filters?.freemiumExpired === 'false') {
            filterConditions.push({
                subscription: { freemiumExpired: false },
            });
        }

        // Filtrar por nÃºmero de bÃºsquedas usadas (5 - freemiumUsesLeft)
        if (filters?.searchesUsed) {
            const used = parseInt(filters.searchesUsed, 10);
            if (!isNaN(used) && used >= 0 && used <= 5) {
                const usesLeft = 5 - used;
                filterConditions.push({
                    subscription: { freemiumUsesLeft: usesLeft },
                });
            }
        }

        // Combinar todas las condiciones con AND
        const where = {
            ...searchCondition,
            ...(filterConditions.length > 0 ? { AND: filterConditions } : {}),
        };

        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                include: {
                    subscription: true,
                    profile: true,
                    alert: { select: { enabled: true, alertTimeLocal: true } },
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
     * Obtiene todos los usuarios para exportaciÃ³n CSV (sin paginaciÃ³n)
     */
    async getAllUsersForExport() {
        await this.syncFreemiumExpirationStatus();

        const users = await this.prisma.user.findMany({
            include: {
                subscription: true,
                profile: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return { users, total: users.length };
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
     * Obtiene usuario por telÃ©fono
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
            throw new ConflictException('El telÃ©fono o email ya estÃ¡ registrado');
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

        this.logger.log(`Usuario creado por admin: ${user.phone}`);
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

        this.logger.log(`Usuario actualizado: ${id}`);
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

        this.logger.log(`Usuario eliminado completamente: ${id}`);
        return { deleted: true };
    }

    /**
     * Elimina usuario por telÃ©fono
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
     * Obtiene suscripciÃ³n de un usuario
     */
    async getSubscription(userId: string) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { userId },
            include: { user: { select: { name: true, phone: true, email: true } } },
        });

        if (!subscription) {
            throw new NotFoundException('SuscripciÃ³n no encontrada');
        }

        return subscription;
    }

    /**
     * Actualiza suscripciÃ³n
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
                premiumWeekStart: now, // Semana empieza desde activaciÃ³n
                freemiumExpired: true,
            },
            create: {
                userId,
                plan: 'PREMIUM',
                status: 'ACTIVE',
                premiumStartDate: now,
                premiumEndDate: premiumEndDate,
                premiumUsesLeft: 5,
                premiumWeekStart: now, // Semana empieza desde activaciÃ³n
                freemiumUsesLeft: 0,
                freemiumStartDate: now,
                freemiumExpired: true,
            },
        });

        // Reactivar alertas si el usuario las tenÃ­a configuradas
        const alertPref = await this.prisma.alertPreference.findUnique({
            where: { userId }
        });

        if (alertPref && !alertPref.enabled) {
            await this.prisma.alertPreference.update({
                where: { userId },
                data: { enabled: true }
            });
            this.logger.log(`Alertas reactivadas para usuario ${userId}`);
        }

        this.logger.log(`Premium activado para usuario: ${userId} (expira: ${premiumEndDate.toISOString()})`);
        return subscription;
    }

    /**
     * Activa plan PRO manualmente (90 dÃ­as)
     */
    async activatePro(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('Usuario no encontrado');

        const now = new Date();
        const proEndDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 dÃ­as

        const subscription = await this.prisma.subscription.upsert({
            where: { userId },
            update: {
                plan: 'PRO',
                status: 'ACTIVE',
                premiumStartDate: now,
                premiumEndDate: proEndDate,
                premiumUsesLeft: 5,
                premiumWeekStart: now,
                freemiumExpired: true,
            },
            create: {
                userId,
                plan: 'PRO',
                status: 'ACTIVE',
                premiumStartDate: now,
                premiumEndDate: proEndDate,
                premiumUsesLeft: 5,
                premiumWeekStart: now,
                freemiumUsesLeft: 0,
                freemiumStartDate: now,
                freemiumExpired: true,
            },
        });

        // Reactivar alertas si el usuario las tenÃ­a configuradas
        const alertPref = await this.prisma.alertPreference.findUnique({
            where: { userId }
        });

        if (alertPref && !alertPref.enabled) {
            await this.prisma.alertPreference.update({
                where: { userId },
                data: { enabled: true }
            });
            this.logger.log(`Alertas reactivadas para usuario ${userId}`);
        }

        this.logger.log(`PRO activado para usuario: ${userId} (expira: ${proEndDate.toISOString()})`);
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
                freemiumUsesLeft: 5,
                freemiumStartDate: new Date(),
                freemiumExpired: false,
            },
            create: {
                userId,
                plan: 'FREEMIUM',
                status: 'ACTIVE',
                freemiumUsesLeft: 5,
                freemiumStartDate: new Date(),
                freemiumExpired: false,
            },
        });

        this.logger.log(`Freemium reiniciado para usuario: ${userId}`);
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
        this.logger.log(`Sesiones eliminadas para usuario: ${userId}`);
        return { deleted: true };
    }

    // ==============================
    // ESTADÃSTICAS
    // ==============================

    async getStats() {
        await this.syncFreemiumExpirationStatus();

        const [
            totalUsers,
            freemiumUsers,
            premiumUsers,
            expiredUsers,
            recentUsers,
            totalTemplatesSent,
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
            this.prisma.subscription.aggregate({
                _sum: { templatesSentCount: true },
            }),
        ]);

        return {
            totalUsers,
            freemiumUsers,
            premiumUsers,
            expiredUsers,
            recentUsers,
            totalTemplatesSent: totalTemplatesSent._sum.templatesSentCount || 0,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Obtiene estadÃ­sticas detalladas con filtros de fecha
     */
    async getDetailedStats(startDate?: Date, endDate?: Date) {
        await this.syncFreemiumExpirationStatus();

        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Ãšltimos 30 dÃ­as por defecto
        const end = endDate || new Date();

        const [
            // Conteos bÃ¡sicos
            totalUsers,
            freemiumActive,
            premiumActive,
            freemiumExpired,

            // Conteos en el perÃ­odo
            newUsersInPeriod,
            conversionsInPeriod,
            paymentsInPeriod,

            // Actividad
            usersWithSearches,
            totalJobsSent,

            // Ingresos
            totalRevenue,

            // Templates
            totalTemplatesSent,
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

            // Nuevos usuarios en el perÃ­odo
            this.prisma.user.count({
                where: { createdAt: { gte: start, lte: end } },
            }),

            // Conversiones a premium en el perÃ­odo
            this.prisma.subscription.count({
                where: {
                    plan: 'PREMIUM',
                    premiumStartDate: { gte: start, lte: end },
                },
            }),

            // Pagos en el perÃ­odo
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

            // Total de templates de alerta enviados
            this.prisma.subscription.aggregate({
                _sum: { templatesSentCount: true },
            }),
        ]);

        // Calcular tasa de conversiÃ³n
        const conversionRate = totalUsers > 0
            ? ((premiumActive / totalUsers) * 100).toFixed(1)
            : '0';

        // Obtener series de tiempo para grÃ¡ficos (Ãºltimos 30 dÃ­as)
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
                totalTemplatesSent: totalTemplatesSent._sum.templatesSentCount || 0,
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
     * Obtiene estadÃ­sticas diarias para grÃ¡ficos
     */
    private async getDailyStats(start: Date, end: Date) {
        const days: { date: string; registros: number; conversiones: number; pagos: number }[] = [];

        // Iterar por cada dÃ­a en el rango
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
     * Obtiene los usuarios mÃ¡s recientes
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
    // EMAILS (PLANTILLAS / CAMPANAS / ENVIOS)
    // ==============================

    private async seedDefaultEmailTemplates(): Promise<void> {
        const defaults = [
            {
                name: 'Bienvenida CIO',
                slug: 'welcome_email',
                description: 'Correo de bienvenida general de CIO',
                subject: 'Bienvenido a CIO - Tu Cazador de Oportunidades',
            },
            {
                name: 'Onboarding CIO',
                slug: 'onboarding_email',
                description: 'Correo de onboarding con instrucciones de uso de CIO',
                subject: '¡Ahora sí, a cazar ofertas de forma inteligente! 🚀',
            },
            {
                name: 'Actualización de Perfil en Portales',
                slug: 'profile_update_email',
                description: 'Correo para mejorar perfil en portales de empleo',
                subject: '¿Ya actualizaste tu perfil en los portales de empleo?',
            },
        ];

        for (const template of defaults) {
            await (this.prisma as any).emailTemplate.upsert({
                where: { slug: template.slug },
                update: {
                    name: template.name,
                    description: template.description,
                    subject: template.subject,
                    type: 'PREDEFINED',
                    isActive: true,
                },
                create: {
                    ...template,
                    type: 'PREDEFINED',
                    isActive: true,
                },
            });
        }
    }

    async getEmailLists() {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [allUsers, freemiumActive, freemiumExpired, premiumActive, newLast7Days] = await Promise.all([
            this.prisma.user.count({
                where: { email: { not: null } },
            }),
            this.prisma.user.count({
                where: {
                    email: { not: null },
                    subscription: {
                        is: {
                            plan: 'FREEMIUM',
                            status: 'ACTIVE',
                            freemiumExpired: false,
                        },
                    },
                },
            }),
            this.prisma.user.count({
                where: {
                    email: { not: null },
                    subscription: {
                        is: {
                            OR: [
                                { freemiumExpired: true },
                                { status: 'EXPIRED' },
                            ],
                        },
                    },
                },
            }),
            this.prisma.user.count({
                where: {
                    email: { not: null },
                    subscription: {
                        is: {
                            plan: { in: ['PREMIUM', 'PRO'] },
                            status: 'ACTIVE',
                            OR: [
                                { premiumEndDate: null },
                                { premiumEndDate: { gte: now } },
                            ],
                        },
                    },
                },
            }),
            this.prisma.user.count({
                where: {
                    email: { not: null },
                    createdAt: { gte: sevenDaysAgo },
                },
            }),
        ]);

        return [
            {
                id: 'ALL_USERS',
                name: 'Todos con email',
                description: 'Todos los usuarios que tienen correo registrado',
                count: allUsers,
            },
            {
                id: 'FREEMIUM_ACTIVE',
                name: 'Freemium activos',
                description: 'Usuarios en plan freemium activo',
                count: freemiumActive,
            },
            {
                id: 'FREEMIUM_EXPIRED',
                name: 'Freemium expirados',
                description: 'Usuarios con prueba gratis expirada',
                count: freemiumExpired,
            },
            {
                id: 'PREMIUM_ACTIVE',
                name: 'Premium / Pro activos',
                description: 'Usuarios con plan de pago activo',
                count: premiumActive,
            },
            {
                id: 'NEW_LAST_7_DAYS',
                name: 'Nuevos (7 dias)',
                description: 'Usuarios registrados en los ultimos 7 dias',
                count: newLast7Days,
            },
        ];
    }

    async listEmailTemplates() {
        await this.seedDefaultEmailTemplates();
        return (this.prisma as any).emailTemplate.findMany({
            orderBy: [
                { type: 'asc' },
                { createdAt: 'desc' },
            ],
        });
    }

    async createEmailTemplate(dto: CreateEmailTemplateDto) {
        const slug = this.normalizeTemplateSlug(dto.slug);
        const existing = await (this.prisma as any).emailTemplate.findUnique({ where: { slug } });
        if (existing) {
            throw new ConflictException('Ya existe una plantilla con ese slug');
        }

        return (this.prisma as any).emailTemplate.create({
            data: {
                name: dto.name,
                slug,
                subject: dto.subject,
                description: dto.description,
                contentHtml: dto.contentHtml,
                type: dto.type || 'CUSTOM',
                isActive: dto.isActive ?? true,
            },
        });
    }

    async updateEmailTemplate(id: string, dto: UpdateEmailTemplateDto) {
        const template = await (this.prisma as any).emailTemplate.findUnique({ where: { id } });
        if (!template) {
            throw new NotFoundException('Plantilla no encontrada');
        }

        if (template.type === 'PREDEFINED' && dto.contentHtml) {
            throw new BadRequestException('Las plantillas preestablecidas no permiten editar HTML');
        }

        return (this.prisma as any).emailTemplate.update({
            where: { id },
            data: {
                name: dto.name,
                subject: dto.subject,
                description: dto.description,
                contentHtml: dto.contentHtml,
                isActive: dto.isActive,
            },
        });
    }

    async deleteEmailTemplate(id: string) {
        const template = await (this.prisma as any).emailTemplate.findUnique({
            where: { id },
            include: { campaigns: { select: { id: true }, take: 1 } },
        });

        if (!template) {
            throw new NotFoundException('Plantilla no encontrada');
        }

        if (template.type === 'PREDEFINED') {
            throw new BadRequestException('No puedes eliminar plantillas preestablecidas');
        }

        if (template.campaigns.length > 0) {
            throw new BadRequestException('No puedes eliminar una plantilla que ya tiene campañas asociadas');
        }

        await (this.prisma as any).emailTemplate.delete({ where: { id } });
        return { deleted: true };
    }

    async listEmailCampaigns(page: number = 1, limit: number = 20) {
        await this.seedDefaultEmailTemplates();
        const skip = (page - 1) * limit;

        const [campaigns, total] = await Promise.all([
            (this.prisma as any).emailCampaign.findMany({
                include: {
                    template: true,
                    _count: { select: { dispatches: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            (this.prisma as any).emailCampaign.count(),
        ]);

        return {
            campaigns,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async createEmailCampaign(dto: CreateEmailCampaignDto, adminUserId?: string) {
        await this.seedDefaultEmailTemplates();

        const template = await (this.prisma as any).emailTemplate.findUnique({
            where: { id: dto.templateId },
        });

        if (!template || !template.isActive) {
            throw new NotFoundException('Plantilla no encontrada o inactiva');
        }

        const scheduledDate = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
        const status = dto.sendNow
            ? 'DRAFT'
            : scheduledDate
                ? 'SCHEDULED'
                : 'DRAFT';

        const campaign = await (this.prisma as any).emailCampaign.create({
            data: {
                name: dto.name,
                templateId: dto.templateId,
                recipientList: dto.recipientList,
                scheduledFor: scheduledDate,
                status: status as any,
                createdById: adminUserId || null,
            },
            include: { template: true },
        });

        if (dto.sendNow) {
            return this.sendEmailCampaign(campaign.id);
        }

        return campaign;
    }

    async updateEmailCampaign(id: string, dto: UpdateEmailCampaignDto) {
        const campaign = await (this.prisma as any).emailCampaign.findUnique({ where: { id } });
        if (!campaign) {
            throw new NotFoundException('Campaña no encontrada');
        }

        if (campaign.status === 'SENT' || campaign.status === 'PROCESSING') {
            throw new BadRequestException('No puedes editar una campaña enviada o en procesamiento');
        }

        const scheduledDate = dto.scheduledFor ? new Date(dto.scheduledFor) : undefined;
        const nextStatus = dto.status
            || (dto.scheduledFor ? 'SCHEDULED' : undefined);

        return (this.prisma as any).emailCampaign.update({
            where: { id },
            data: {
                name: dto.name,
                recipientList: dto.recipientList as any,
                scheduledFor: scheduledDate,
                status: nextStatus as any,
            },
            include: { template: true },
        });
    }

    async deleteEmailCampaign(id: string) {
        const campaign = await (this.prisma as any).emailCampaign.findUnique({ where: { id } });
        if (!campaign) {
            throw new NotFoundException('Campaña no encontrada');
        }

        if (campaign.status === 'PROCESSING') {
            throw new BadRequestException('No puedes eliminar una campaña en procesamiento');
        }

        await (this.prisma as any).emailCampaign.delete({ where: { id } });
        return { deleted: true };
    }

    async listSentEmails(page: number = 1, limit: number = 20, search?: string) {
        const skip = (page - 1) * limit;

        const where = search
            ? {
                OR: [
                    { email: { contains: search, mode: 'insensitive' as const } },
                    { campaign: { name: { contains: search, mode: 'insensitive' as const } } },
                    { name: { contains: search, mode: 'insensitive' as const } },
                ],
            }
            : {};

        const [dispatches, total] = await Promise.all([
            (this.prisma as any).emailDispatch.findMany({
                where,
                include: {
                    campaign: {
                        include: { template: true },
                    },
                    user: {
                        select: { id: true, name: true, email: true, phone: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            (this.prisma as any).emailDispatch.count({ where }),
        ]);

        return {
            data: dispatches,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async sendEmailCampaign(campaignId: string) {
        const campaign = await (this.prisma as any).emailCampaign.findUnique({
            where: { id: campaignId },
            include: { template: true },
        });

        if (!campaign) {
            throw new NotFoundException('Campaña no encontrada');
        }

        if (!campaign.template.isActive) {
            throw new BadRequestException('La plantilla de la campaña está inactiva');
        }

        if (campaign.status === 'PROCESSING') {
            throw new BadRequestException('La campaña ya está en procesamiento');
        }

        const recipients = await this.resolveCampaignRecipients(campaign.recipientList as any);

        await (this.prisma as any).emailCampaign.update({
            where: { id: campaign.id },
            data: {
                status: 'PROCESSING',
                totalRecipients: recipients.length,
                successCount: 0,
                failureCount: 0,
            },
        });

        let successCount = 0;
        let failureCount = 0;

        for (const recipient of recipients) {
            try {
                const sendResult = await this.notificationsService.sendTemplateEmailBySlug({
                    slug: campaign.template.slug,
                    to: recipient.email,
                    name: recipient.name,
                    subject: campaign.template.subject,
                    html: campaign.template.contentHtml,
                });

                await (this.prisma as any).emailDispatch.create({
                    data: {
                        campaignId: campaign.id,
                        userId: recipient.id,
                        email: recipient.email,
                        name: recipient.name,
                        status: 'SENT',
                        providerMessageId: sendResult.id,
                        sentAt: new Date(),
                    },
                });
                successCount++;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
                await (this.prisma as any).emailDispatch.create({
                    data: {
                        campaignId: campaign.id,
                        userId: recipient.id,
                        email: recipient.email,
                        name: recipient.name,
                        status: 'FAILED',
                        errorMessage,
                    },
                });
                failureCount++;
            }
        }

        const finalStatus = successCount > 0 ? 'SENT' : 'FAILED';

        return (this.prisma as any).emailCampaign.update({
            where: { id: campaign.id },
            data: {
                status: finalStatus as any,
                sentAt: new Date(),
                totalRecipients: recipients.length,
                successCount,
                failureCount,
            },
            include: {
                template: true,
                _count: { select: { dispatches: true } },
            },
        });
    }

    async processScheduledEmailCampaigns() {
        const now = new Date();
        const campaigns = await (this.prisma as any).emailCampaign.findMany({
            where: {
                status: 'SCHEDULED',
                scheduledFor: { lte: now },
            },
            orderBy: { scheduledFor: 'asc' },
            take: 20,
        });

        for (const campaign of campaigns) {
            try {
                await this.sendEmailCampaign(campaign.id);
                this.logger.log(`📧 Campaña programada enviada: ${campaign.id}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Error enviando campaña programada ${campaign.id}: ${errorMessage}`);
                await (this.prisma as any).emailCampaign.update({
                    where: { id: campaign.id },
                    data: { status: 'FAILED' },
                });
            }
        }
    }

    private async resolveCampaignRecipients(recipientList: 'ALL_USERS' | 'FREEMIUM_ACTIVE' | 'FREEMIUM_EXPIRED' | 'PREMIUM_ACTIVE' | 'NEW_LAST_7_DAYS') {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const baseSelect = { id: true, name: true, email: true } as const;

        switch (recipientList) {
            case 'FREEMIUM_ACTIVE':
                return this.prisma.user.findMany({
                    where: {
                        email: { not: null },
                        subscription: {
                            is: {
                                plan: 'FREEMIUM',
                                status: 'ACTIVE',
                                freemiumExpired: false,
                            },
                        },
                    },
                    select: baseSelect,
                }).then((users) => users.map((u) => ({
                    id: u.id,
                    name: u.name || 'Usuario',
                    email: u.email || '',
                })));

            case 'FREEMIUM_EXPIRED':
                return this.prisma.user.findMany({
                    where: {
                        email: { not: null },
                        subscription: {
                            is: {
                                OR: [
                                    { freemiumExpired: true },
                                    { status: 'EXPIRED' },
                                ],
                            },
                        },
                    },
                    select: baseSelect,
                }).then((users) => users.map((u) => ({
                    id: u.id,
                    name: u.name || 'Usuario',
                    email: u.email || '',
                })));

            case 'PREMIUM_ACTIVE':
                return this.prisma.user.findMany({
                    where: {
                        email: { not: null },
                        subscription: {
                            is: {
                                plan: { in: ['PREMIUM', 'PRO'] },
                                status: 'ACTIVE',
                                OR: [
                                    { premiumEndDate: null },
                                    { premiumEndDate: { gte: now } },
                                ],
                            },
                        },
                    },
                    select: baseSelect,
                }).then((users) => users.map((u) => ({
                    id: u.id,
                    name: u.name || 'Usuario',
                    email: u.email || '',
                })));

            case 'NEW_LAST_7_DAYS':
                return this.prisma.user.findMany({
                    where: {
                        email: { not: null },
                        createdAt: { gte: sevenDaysAgo },
                    },
                    select: baseSelect,
                }).then((users) => users.map((u) => ({
                    id: u.id,
                    name: u.name || 'Usuario',
                    email: u.email || '',
                })));

            case 'ALL_USERS':
            default:
                return this.prisma.user.findMany({
                    where: { email: { not: null } },
                    select: baseSelect,
                }).then((users) => users.map((u) => ({
                    id: u.id,
                    name: u.name || 'Usuario',
                    email: u.email || '',
                })));
        }
    }

    private normalizeTemplateSlug(input: string): string {
        return input
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s_-]/g, '')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_');
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

    /**
     * Sincroniza expiraciÃ³n de freemium para mantener consistencia en admin.
     * Marca EXPIRED cuando pasaron 5 dÃ­as hÃ¡biles o no hay usos.
     */
    private async syncFreemiumExpirationStatus(): Promise<void> {
        const candidates = await this.prisma.subscription.findMany({
            where: {
                plan: 'FREEMIUM',
                OR: [
                    { freemiumExpired: false },
                    { status: 'ACTIVE' },
                ],
            },
            select: {
                userId: true,
                freemiumStartDate: true,
                freemiumUsesLeft: true,
                freemiumExpired: true,
                status: true,
            },
        });

        if (candidates.length === 0) return;

        const usersToExpire: string[] = [];
        for (const subscription of candidates) {
            const businessDays = countBusinessDays(subscription.freemiumStartDate, new Date());
            const shouldExpire = businessDays >= 5 || subscription.freemiumUsesLeft <= 0;
            if (shouldExpire) {
                usersToExpire.push(subscription.userId);
            }
        }

        if (usersToExpire.length === 0) return;

        await this.prisma.subscription.updateMany({
            where: { userId: { in: usersToExpire } },
            data: {
                freemiumExpired: true,
                status: 'EXPIRED',
            },
        });
    }

    // ==============================
    // TEST (TEMPORAL)
    // ==============================

    /**
     * [TEMPORAL] EnvÃ­a un template de prueba para verificar integraciÃ³n
     */
    async sendTestTemplate(
        phone: string,
        name: string,
        jobCount: string,
        role: string,
    ): Promise<void> {
        this.logger.log(`Enviando template de prueba a ${phone}`);

        await this.whatsappService.sendTemplateMessage(
            phone,
            'job_alert_notification',
            'es_CO',
            [name, jobCount, role]
        );

        this.logger.log(`Template de prueba enviado a ${phone}`);
    }
}

