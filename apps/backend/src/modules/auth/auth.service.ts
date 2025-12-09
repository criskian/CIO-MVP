import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) { }

    /**
     * Valida credenciales y retorna token JWT
     */
    async login(loginDto: LoginDto) {
        const { email, password } = loginDto;

        // Buscar usuario admin
        const admin = await this.prisma.adminUser.findUnique({
            where: { email },
        });

        if (!admin) {
            this.logger.warn(`Intento de login fallido: Email no existe (${email})`);
            throw new UnauthorizedException('Credenciales inválidas');
        }

        if (!admin.isActive) {
            this.logger.warn(`Intento de login usuario inactivo: ${email}`);
            throw new UnauthorizedException('Usuario inactivo');
        }

        // Verificar contraseña
        const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);

        if (!isPasswordValid) {
            this.logger.warn(`Intento de login fallido: Password incorrecto (${email})`);
            throw new UnauthorizedException('Credenciales inválidas');
        }

        // Generar token
        const payload = { sub: admin.id, email: admin.email, role: admin.role };

        this.logger.log(`✅ Login exitoso admin: ${email}`);

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
            },
        };
    }
}
