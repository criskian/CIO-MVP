import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { 
      status: 'ok', 
      service: 'CIO Backend',
      timestamp: new Date().toISOString() 
    };
  }

  @Get()
  root() {
    return {
      message: 'CIO Backend API',
      version: '1.0.0',
      endpoints: {
        health: '/health',
        webhook: '/webhook/whatsapp',
        registration: '/api/registration',
        admin: '/api/admin',
      }
    };
  }
}

