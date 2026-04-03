import {
    IsString,
    IsEmail,
    IsOptional,
    IsBoolean,
    IsNumber,
    IsIn,
    IsDateString,
} from 'class-validator';

/**
 * DTO para crear usuario desde admin
 */
export class CreateUserDto {
    @IsString()
    phone!: string;

    @IsString()
    name!: string;

    @IsEmail()
    @IsOptional()
    email?: string;

    @IsBoolean()
    @IsOptional()
    createSubscription?: boolean;

    @IsString()
    @IsOptional()
    @IsIn(['FREEMIUM', 'PREMIUM', 'PRO'])
    plan?: 'FREEMIUM' | 'PREMIUM' | 'PRO';
}

/**
 * DTO para actualizar usuario
 */
export class UpdateUserDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsEmail()
    @IsOptional()
    email?: string;

    @IsString()
    @IsOptional()
    phone?: string;
}

/**
 * DTO para actualizar suscripción
 */
export class UpdateSubscriptionDto {
    @IsString()
    @IsOptional()
    @IsIn(['FREEMIUM', 'PREMIUM', 'PRO'])
    plan?: 'FREEMIUM' | 'PREMIUM' | 'PRO';

    @IsString()
    @IsOptional()
    @IsIn(['ACTIVE', 'EXPIRED', 'CANCELLED'])
    status?: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

    @IsNumber()
    @IsOptional()
    freemiumUsesLeft?: number;

    @IsBoolean()
    @IsOptional()
    freemiumExpired?: boolean;

    @IsNumber()
    @IsOptional()
    premiumUsesLeft?: number;

    @IsOptional()
    premiumWeekStart?: Date;

    @IsOptional()
    premiumStartDate?: Date;

    @IsOptional()
    premiumEndDate?: Date;
}

/**
 * DTO para crear plantilla de email (custom o predefinida)
 */
export class CreateEmailTemplateDto {
    @IsString()
    name!: string;

    @IsString()
    slug!: string;

    @IsString()
    subject!: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    contentHtml?: string;

    @IsString()
    @IsOptional()
    @IsIn(['PREDEFINED', 'CUSTOM'])
    type?: 'PREDEFINED' | 'CUSTOM';

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}

/**
 * DTO para actualizar plantilla de email
 */
export class UpdateEmailTemplateDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    subject?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    contentHtml?: string;

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}

/**
 * DTO para crear campaña de emails
 */
export class CreateEmailCampaignDto {
    @IsString()
    name!: string;

    @IsString()
    templateId!: string;

    @IsString()
    @IsIn([
        'ALL_USERS',
        'FREEMIUM_ACTIVE',
        'FREEMIUM_EXPIRED',
        'PREMIUM_ACTIVE',
        'NEW_LAST_7_DAYS',
    ])
    recipientList!: 'ALL_USERS' | 'FREEMIUM_ACTIVE' | 'FREEMIUM_EXPIRED' | 'PREMIUM_ACTIVE' | 'NEW_LAST_7_DAYS';

    @IsDateString()
    @IsOptional()
    scheduledFor?: string;

    @IsBoolean()
    @IsOptional()
    sendNow?: boolean;
}

/**
 * DTO para editar campaña de emails
 */
export class UpdateEmailCampaignDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    @IsIn([
        'ALL_USERS',
        'FREEMIUM_ACTIVE',
        'FREEMIUM_EXPIRED',
        'PREMIUM_ACTIVE',
        'NEW_LAST_7_DAYS',
    ])
    recipientList?: 'ALL_USERS' | 'FREEMIUM_ACTIVE' | 'FREEMIUM_EXPIRED' | 'PREMIUM_ACTIVE' | 'NEW_LAST_7_DAYS';

    @IsDateString()
    @IsOptional()
    scheduledFor?: string;

    @IsString()
    @IsOptional()
    @IsIn(['DRAFT', 'SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'])
    status?: 'DRAFT' | 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';
}

/**
 * DTO para enviar template de WhatsApp a un usuario puntual desde admin.
 */
export class SendWhatsAppTemplateDto {
    @IsString()
    userId!: string;

    @IsString()
    @IsOptional()
    templateName?: string;

    @IsString()
    @IsOptional()
    languageCode?: string;

    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    jobCount?: string;

    @IsString()
    @IsOptional()
    role?: string;

    @IsString()
    @IsOptional()
    buttonPayload?: string;
}
