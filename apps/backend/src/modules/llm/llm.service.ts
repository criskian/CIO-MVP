import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import OpenAI from 'openai';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  // private openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    // TODO: Inicializar cliente de OpenAI
    // const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    // this.openai = new OpenAI({ apiKey });
  }

  /**
   * Parsea un texto libre de salario a un número o rango
   * Por ahora es un stub
   */
  async parseSalaryFreeText(text: string): Promise<number | null> {
    // TODO: Implementar con OpenAI o lógica básica
    this.logger.log(`Parseando salario: ${text}`);
    return null;
  }

  /**
   * Resume una oferta para el usuario
   * Por ahora es un stub
   */
  async summarizeJobForUser(jobPosting: any, userProfile: any): Promise<string> {
    // TODO: Implementar con OpenAI
    this.logger.log('Resumiendo oferta para usuario');
    return 'Resumen de oferta (stub)';
  }

  /**
   * Infiere la intención del usuario desde un mensaje
   * Por ahora es un stub
   */
  async inferIntentFromMessage(text: string): Promise<string> {
    // TODO: Implementar con OpenAI
    this.logger.log(`Infiriendo intención: ${text}`);
    return 'unknown';
  }
}

