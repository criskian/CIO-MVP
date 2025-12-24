import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
  MaxLength,
  IsBoolean,
} from 'class-validator';

/**
 * DTO para registro de usuarios desde la landing page
 * Valida nombre, email, teléfono y aceptación de términos
 *
 * Las propiedades usan `!:` porque son validadas por class-validator
 * antes de que NestJS use el objeto
 */
export class RegisterUserDto {
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  name!: string;

  @IsEmail({}, { message: 'Ingresa un email válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email!: string;

  @IsString({ message: 'El teléfono debe ser texto' })
  @IsNotEmpty({ message: 'El número de WhatsApp es requerido' })
  @Matches(/^\d{1,4}\d{7,15}$/, {
    message: 'El número debe incluir el código de país seguido de tu número (ej: 573001234567)',
  })
  phone!: string;

  @IsBoolean({ message: 'Debes indicar si aceptas los términos' })
  @IsNotEmpty({ message: 'Debes aceptar los términos' })
  acceptedTerms!: boolean;
}

