import { IsString, IsEmail, IsOptional, IsBoolean, IsNumber, IsIn } from 'class-validator';

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
    @IsIn(['FREEMIUM', 'PREMIUM'])
    plan?: 'FREEMIUM' | 'PREMIUM';
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
    @IsIn(['FREEMIUM', 'PREMIUM'])
    plan?: 'FREEMIUM' | 'PREMIUM';

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
