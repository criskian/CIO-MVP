import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { SYSTEM_PROMPTS } from './knowledge-base';
import { UserIntent } from '../conversation/types/conversation-states';

// ===== Tipos de respuesta =====

export interface RoleValidationResult {
  isValid: boolean;
  role: string | null;
  warning: string | null;
  suggestion: string | null;
}

export interface LocationValidationResult {
  isValid: boolean;
  location: string | null;
  wasCorrected: boolean;
  suggestion: string | null;
}

export interface IntentDetectionResult {
  intent: UserIntent;
  confidence: number;
}

export interface OutOfFlowResult {
  isValidAnswer: boolean;
  response: string | null;
  extractedAnswer: string | null;
}

export interface RoleSuggestionsResult {
  suggestions: string[];
  category: string;
}

export interface SearchFailureDiagnosisResult {
  reason: 'profile_parameters_issue' | 'temporary_system_issue' | 'unknown';
  suggestion: string;
  userMessage: string;
}

export interface VacancyReuseScoreResult {
  reuseScore: number;
  rationale: string;
}

export interface InitialProfileExtractionResult {
  role: string | null;
  location: string | null;
  modality: 'remote' | 'hybrid' | 'onsite' | null;
  experienceLevel: 'none' | 'junior' | 'mid' | 'senior' | 'lead' | null;
  experienceYears: number | null;
  seniority: string | null;
  sector: string | null;
  confidence: number;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private openai: OpenAI | null = null;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.isEnabled = true;
      this.logger.log('✅ LlmService inicializado con OpenAI GPT-4o-mini');
    } else {
      this.isEnabled = false;
      this.logger.warn('⚠️ OPENAI_API_KEY no configurada — LlmService desactivado, usando solo regex');
    }
  }

  // ===== Método core de llamada a OpenAI =====

  private async callOpenAI(systemPrompt: string, userMessage: string): Promise<string | null> {
    if (!this.openai || !this.isEnabled) {
      return null;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        this.logger.warn('OpenAI devolvió respuesta vacía');
        return null;
      }

      this.logger.debug(`🤖 Tokens usados: input=${response.usage?.prompt_tokens}, output=${response.usage?.completion_tokens}`);
      return content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Error llamando a OpenAI: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Llama a OpenAI en modo TEXTO (no JSON).
   * Usado para respuestas conversacionales naturales.
   * Temperature más alta para variedad en las respuestas.
   */
  private async callOpenAIText(systemPrompt: string, userMessage: string): Promise<string | null> {
    if (!this.openai || !this.isEnabled) {
      return null;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7, // Más alta para variedad conversacional
        max_tokens: 300,
        // SIN response_format: json_object — queremos texto natural
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        this.logger.warn('OpenAI devolvió respuesta de texto vacía');
        return null;
      }

      this.logger.debug(`💬 Respuesta conversacional generada (${content.length} chars)`);
      return content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Error en llamada de texto a OpenAI: ${errorMessage}`);
      return null;
    }
  }

  private parseJSON<T>(jsonString: string | null, fallback: T): T {
    if (!jsonString) return fallback;
    try {
      return JSON.parse(jsonString) as T;
    } catch {
      this.logger.warn(`No se pudo parsear JSON: ${jsonString.substring(0, 100)}`);
      return fallback;
    }
  }

  // ===== Métodos públicos =====

  /**
   * Valida y corrige el cargo/rol que escribió el usuario.
   * Detecta: múltiples roles, roles genéricos, frases largas, typos.
   * Retorna null si el LLM no está disponible (fallback a regex).
   */
  async validateAndCorrectRole(text: string): Promise<RoleValidationResult | null> {
    const raw = await this.callOpenAI(SYSTEM_PROMPTS.ROLE_VALIDATION, text);
    if (!raw) return null;

    const result = this.parseJSON<RoleValidationResult>(raw, {
      isValid: true,
      role: text.trim(),
      warning: null,
      suggestion: null,
    });

    if (result.isValid && result.role) {
      this.logger.log(`✅ Rol validado por IA: "${text}" → "${result.role}"`);
    } else {
      this.logger.log(`⚠️ Rol rechazado por IA: "${text}" — ${result.warning || result.suggestion}`);
    }

    return result;
  }

  /**
   * Valida y corrige la ubicación geográfica.
   * Corrige typos, rechaza ubicaciones vagas, extrae de texto largo.
   * Retorna null si el LLM no está disponible (fallback a regex).
   */
  async validateAndCorrectLocation(text: string): Promise<LocationValidationResult | null> {
    const raw = await this.callOpenAI(SYSTEM_PROMPTS.LOCATION_VALIDATION, text);
    if (!raw) return null;

    const result = this.parseJSON<LocationValidationResult>(raw, {
      isValid: false,
      location: null,
      wasCorrected: false,
      suggestion: null,
    });

    if (result.isValid && result.location) {
      this.logger.log(`✅ Ubicación validada por IA: "${text}" → "${result.location}"${result.wasCorrected ? ' (corregida)' : ''}`);
    } else {
      this.logger.log(`⚠️ Ubicación rechazada por IA: "${text}"`);
    }

    return result;
  }

  /**
   * Detecta la intención del usuario cuando el regex no pudo.
   * Solo se llama cuando detectIntent() de input-validators retorna UNKNOWN.
   * Retorna null si el LLM no está disponible (fallback a UNKNOWN).
   */
  async detectIntent(text: string, currentState: string): Promise<UserIntent | null> {
    const prompt = SYSTEM_PROMPTS.INTENT_DETECTION;
    const userMessage = `Estado actual: ${currentState}\nMensaje del usuario: ${text}`;

    const raw = await this.callOpenAI(prompt, userMessage);
    if (!raw) return null;

    const result = this.parseJSON<IntentDetectionResult>(raw, {
      intent: UserIntent.UNKNOWN,
      confidence: 0,
    });

    // Solo aceptar si la confianza es >= 0.7
    if (result.confidence >= 0.7 && result.intent !== UserIntent.UNKNOWN) {
      this.logger.log(`🧠 Intent detectado por IA: "${text}" → ${result.intent} (confianza: ${result.confidence})`);

      // Mapear string a enum
      const intentMap: Record<string, UserIntent> = {
        search_now: UserIntent.SEARCH_NOW,
        change_preferences: UserIntent.CHANGE_PREFERENCES,
        upload_cv: UserIntent.UPLOAD_CV,
        help: UserIntent.HELP,
        accept: UserIntent.ACCEPT,
        reject: UserIntent.REJECT,
        unknown: UserIntent.UNKNOWN,
      };

      return intentMap[result.intent] || UserIntent.UNKNOWN;
    }

    this.logger.debug(`🤷 IA no pudo detectar intent con confianza suficiente: "${text}" → ${result.intent} (${result.confidence})`);
    return null;
  }

  /**
   * Maneja mensajes fuera de flujo durante el onboarding.
   * Detecta si el mensaje contiene una respuesta válida, es una pregunta, o es irrelevante.
   * Retorna null si el LLM no está disponible.
   */
  async handleOutOfFlowMessage(text: string, currentState: string): Promise<OutOfFlowResult | null> {
    const prompt = SYSTEM_PROMPTS.OUT_OF_FLOW;
    const userMessage = `ESTADO_ACTUAL: ${currentState}\nMensaje del usuario: ${text}`;

    const raw = await this.callOpenAI(prompt, userMessage);
    if (!raw) return null;

    const result = this.parseJSON<OutOfFlowResult>(raw, {
      isValidAnswer: false,
      response: null,
      extractedAnswer: null,
    });

    if (result.isValidAnswer) {
      this.logger.log(`🎯 IA extrajo respuesta válida de out-of-flow: "${text}" → "${result.extractedAnswer}"`);
    } else {
      this.logger.log(`💬 IA manejó out-of-flow: "${text}" en estado ${currentState}`);
    }

    return result;
  }

  /**
   * Sugiere roles alternativos cuando hay pocas vacantes.
   * Retorna array vacío si el LLM no está disponible.
   */
  async suggestRelatedRoles(role: string): Promise<string[]> {
    const raw = await this.callOpenAI(SYSTEM_PROMPTS.SUGGEST_RELATED_ROLES, role);
    if (!raw) return [];

    const result = this.parseJSON<RoleSuggestionsResult>(raw, {
      suggestions: [],
      category: '',
    });

    if (result.suggestions.length > 0) {
      this.logger.log(`💡 Roles sugeridos para "${role}": ${result.suggestions.join(', ')} (categoría: ${result.category})`);
    }

    return result.suggestions;
  }

  /**
   * Extrae variables de perfil inicial desde texto libre del usuario.
   * Retorna null si el LLM no esta disponible.
   */
  async extractInitialProfileFromFreeText(
    text: string,
  ): Promise<InitialProfileExtractionResult | null> {
    const raw = await this.callOpenAI(SYSTEM_PROMPTS.INITIAL_PROFILE_EXTRACTION, text);
    if (!raw) return null;

    const result = this.parseJSON<InitialProfileExtractionResult>(raw, {
      role: null,
      location: null,
      modality: null,
      experienceLevel: null,
      experienceYears: null,
      seniority: null,
      sector: null,
      confidence: 0,
    });

    this.logger.log(
      `🧩 Extraccion inicial perfil: role=${result.role || '-'}, location=${result.location || '-'}, modality=${result.modality || '-'}, exp=${result.experienceLevel || '-'} (conf=${result.confidence ?? 0})`,
    );

    return result;
  }

  /**
   * Diagnostica la posible causa de un fallo de búsqueda y sugiere acción al usuario.
   * Retorna null si el LLM no está disponible.
   */
  async diagnoseSearchFailure(input: {
    errorMessage: string;
    role?: string | null;
    location?: string | null;
    experienceLevel?: string | null;
    jobType?: string | null;
    minSalary?: number | null;
  }): Promise<SearchFailureDiagnosisResult | null> {
    const raw = await this.callOpenAI(
      SYSTEM_PROMPTS.SEARCH_FAILURE_DIAGNOSIS,
      JSON.stringify(input),
    );
    if (!raw) return null;

    const result = this.parseJSON<SearchFailureDiagnosisResult>(raw, {
      reason: 'unknown',
      suggestion: 'Reintentar en unos minutos',
      userMessage: 'Hubo un problema temporal al buscar ofertas. Intenta de nuevo en unos minutos.',
    });

    if (result.userMessage) {
      this.logger.log(`🩺 Diagnóstico IA de fallo de búsqueda: ${result.reason}`);
    }

    return result;
  }

  /**
   * Calcula score de reutilizacion de vacantes tras rechazo del usuario.
   * Retorna null si el LLM no esta disponible.
   */
  async scoreVacancyReuse(input: {
    rejectionReason: 'role' | 'location' | 'company' | 'salary' | 'remote' | 'other';
    userProfile: {
      role?: string | null;
      location?: string | null;
      experienceLevel?: string | null;
    };
    rejectedVacancy?: {
      title?: string | null;
      company?: string | null;
      locationRaw?: string | null;
      salaryRaw?: string | null;
      source?: string | null;
    } | null;
    candidateVacancies: Array<{
      title?: string | null;
      company?: string | null;
      locationRaw?: string | null;
      salaryRaw?: string | null;
      source?: string | null;
      score?: number | null;
    }>;
  }): Promise<VacancyReuseScoreResult | null> {
    const raw = await this.callOpenAI(
      SYSTEM_PROMPTS.VACANCY_REUSE_SCORING,
      JSON.stringify(input),
    );
    if (!raw) return null;

    const result = this.parseJSON<VacancyReuseScoreResult>(raw, {
      reuseScore: 0.5,
      rationale: 'No hubo suficiente contexto para estimar con alta confianza.',
    });

    const boundedScore = Number.isFinite(result.reuseScore)
      ? Math.min(1, Math.max(0, result.reuseScore))
      : 0.5;

    this.logger.log(`🎯 Score IA de reutilizacion: ${boundedScore.toFixed(2)}`);

    return {
      reuseScore: boundedScore,
      rationale: result.rationale || '',
    };
  }

  // ===== Método conversacional =====

  /**
   * Genera una respuesta conversacional natural y única para el usuario.
   * NO retorna JSON — retorna texto directo listo para WhatsApp.
   * Usado cuando el input del usuario no es lo esperado en el paso actual.
   * 
   * @param text - Lo que escribió el usuario
   * @param currentState - El estado actual del onboarding (ASK_ROLE, ASK_LOCATION, etc.)
   * @returns Texto natural para responder al usuario, o null si LLM no está disponible
   */
  async generateConversationalResponse(text: string, currentState: string): Promise<string | null> {
    const userMessage = `ESTADO_ACTUAL: ${currentState}\nMENSAJE_DEL_USUARIO: ${text}`;
    const response = await this.callOpenAIText(SYSTEM_PROMPTS.CONVERSATIONAL_REDIRECT, userMessage);

    if (response) {
      this.logger.log(`🗣️ Respuesta conversacional para "${text}" en ${currentState}`);
    }

    return response;
  }

  // ===== Métodos legacy (mantenidos por compatibilidad) =====

  /**
   * Parsea un texto libre de salario a un número
   * @deprecated Usar normalizeSalary de input-validators en su lugar
   */
  async parseSalaryFreeText(text: string): Promise<number | null> {
    this.logger.log(`Parseando salario: ${text}`);
    return null;
  }

  /**
   * Resume una oferta para el usuario
   * @deprecated Pendiente de implementación en fase futura
   */
  async summarizeJobForUser(jobPosting: any, userProfile: any): Promise<string> {
    this.logger.log('Resumiendo oferta para usuario');
    return 'Resumen de oferta (pendiente)';
  }

  /**
   * Infiere la intención del usuario
   * @deprecated Usar detectIntent(text, state) en su lugar
   */
  async inferIntentFromMessage(text: string): Promise<string> {
    this.logger.log(`Infiriendo intención: ${text}`);
    return 'unknown';
  }
}
