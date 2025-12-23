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

  @Get('/')
  root() {
    return { 
      message: 'CIO Backend API is running',
      version: '1.0.0',
      docs: '/api'
    };
  }
}

