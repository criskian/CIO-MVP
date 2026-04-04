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

export interface PremiumSearchExpansionDecision {
  shouldFetchMore: boolean;
  confidence: number;
  rationale: string;
}

export interface FreeSearchStrategyDecision {
  strategy: 'reuse_cache' | 'force_fresh';
  confidence: number;
  rationale: string;
}

export interface PremiumJobRerankResult {
  orderedIndexes: number[];
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

export interface RejectionReasonClassificationResult {
  reason: 'role' | 'location' | 'company' | 'salary' | 'remote' | 'experience' | 'other';
  confidence: number;
  rationale: string;
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
      this.logger.log('âœ… LlmService inicializado con OpenAI GPT-4o-mini');
    } else {
      this.isEnabled = false;
      this.logger.warn('🚫 OPENAI_API_KEY no configurada — LlmService desactivado, usando solo regex');
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

      this.logger.debug(`🔍 Tokens usados: input=${response.usage?.prompt_tokens}, output=${response.usage?.completion_tokens}`);
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
        max_tokens: 500,
        // SIN response_format: json_object — queremos texto natural
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        this.logger.warn('OpenAI devolvió respuesta de texto vacía');
        return null;
      }

      this.logger.debug(`🗣️ Respuesta conversacional generada (${content.length} chars)`);
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
      this.logger.log(`👍 Rol validado por IA: "${text}" → "${result.role}"`);
    } else {
      this.logger.log(`🚫 Rol rechazado por IA: "${text}" — ${result.warning || result.suggestion}`);
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
      this.logger.log(`👍 Ubicación validada por IA: "${text}" → "${result.location}"${result.wasCorrected ? ' (corregida)' : ''}`);
    } else {
      this.logger.log(`🚫 Ubicación rechazada por IA: "${text}"`);
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
      this.logger.log(`👍 Intent detectado por IA: "${text}" → ${result.intent} (confianza: ${result.confidence})`);

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

    this.logger.debug(`🚫 IA no pudo detectar intent con confianza suficiente: "${text}" → ${result.intent} (${result.confidence})`);
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
      this.logger.log(`👍 IA extrajo respuesta válida de out-of-flow: "${text}" → "${result.extractedAnswer}"`);
    } else {
      this.logger.log(`🚫 IA manejó out-of-flow: "${text}" en estado ${currentState}`);
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
      this.logger.log(`👍 Roles sugeridos para "${role}": ${result.suggestions.join(', ')} (categoría: ${result.category})`);
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
      `👍 Extraccion inicial perfil: role=${result.role || '-'}, location=${result.location || '-'}, modality=${result.modality || '-'}, exp=${result.experienceLevel || '-'} (conf=${result.confidence ?? 0})`,
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
      this.logger.log(`👍 Diagnóstico IA de fallo de búsqueda: ${result.reason}`);
    }

    return result;
  }

  /**
   * Calcula score de reutilizacion de vacantes tras rechazo del usuario.
   * Retorna null si el LLM no está disponible.
   */
  async scoreVacancyReuse(input: {
    rejectionReason: 'role' | 'location' | 'company' | 'salary' | 'remote' | 'experience' | 'other';
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

    this.logger.log(`👍 Score IA de reutilizacion: ${boundedScore.toFixed(2)}`);

    return {
      reuseScore: boundedScore,
      rationale: result.rationale || '',
    };
  }

  /**
   * Clasifica texto libre de "otro motivo" de rechazo en una razon accionable.
   * Retorna null si el LLM no está disponible.
   */
  async classifyRejectionReason(
    text: string,
  ): Promise<RejectionReasonClassificationResult | null> {
    const raw = await this.callOpenAI(
      SYSTEM_PROMPTS.REJECTION_REASON_CLASSIFICATION,
      text,
    );
    if (!raw) return null;

    const result = this.parseJSON<RejectionReasonClassificationResult>(raw, {
      reason: 'other',
      confidence: 0.5,
      rationale: 'No fue posible clasificar con alta confianza.',
    });

    const allowedReasons = new Set(['role', 'location', 'company', 'salary', 'remote', 'experience', 'other']);
    const reason = allowedReasons.has(result.reason) ? result.reason : 'other';
    const confidence = Number.isFinite(result.confidence)
      ? Math.min(1, Math.max(0, result.confidence))
      : 0.5;

    this.logger.log(
      `👍 Clasificación IA de rechazo: reason=${reason}, confidence=${confidence.toFixed(2)}`,
    );

    return {
      reason: reason as RejectionReasonClassificationResult['reason'],
      confidence,
      rationale: result.rationale || '',
    };
  }

  /**
   * Decide si conviene ejecutar una busqueda adicional para premium.
   * Si el LLM no esta disponible, usa una heuristica conservadora.
   */
  async shouldFetchMorePremiumJobs(input: {
    role?: string | null;
    location?: string | null;
    experienceLevel?: string | null;
    jobs: Array<{
      title?: string | null;
      company?: string | null;
      locationRaw?: string | null;
      source?: string | null;
      score?: number | null;
    }>;
    targetResults: number;
    offersExhausted?: boolean;
  }): Promise<PremiumSearchExpansionDecision | null> {
    if (input.offersExhausted) {
      return {
        shouldFetchMore: false,
        confidence: 1,
        rationale: 'No hay mas paginas disponibles segun el buscador.',
      };
    }

    const fallbackDecision: PremiumSearchExpansionDecision = {
      shouldFetchMore: input.jobs.length < input.targetResults,
      confidence: 0.6,
      rationale: 'Heuristica local por cantidad de resultados disponibles.',
    };

    const systemPrompt = [
      'Eres un evaluador de calidad de resultados para un buscador de empleo premium.',
      'Debes decidir si conviene ejecutar UNA busqueda adicional de pagina.',
      'Responde SOLO JSON valido con: {"shouldFetchMore": boolean, "confidence": number, "rationale": string}.',
      'Criterios:',
      '- Si hay pocas ofertas para el objetivo del plan premium, prioriza shouldFetchMore=true.',
      '- Si la relevancia promedio parece baja o repetitiva, prioriza shouldFetchMore=true.',
      '- Si ya hay variedad y alta relevancia suficiente, puedes responder false.',
      '- confidence debe estar entre 0 y 1.',
    ].join('\n');

    const raw = await this.callOpenAI(systemPrompt, JSON.stringify(input));
    if (!raw) return fallbackDecision;

    const parsed = this.parseJSON<PremiumSearchExpansionDecision>(raw, fallbackDecision);
    const confidence = Number.isFinite(parsed.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence))
      : fallbackDecision.confidence;

    return {
      shouldFetchMore: parsed.shouldFetchMore === true,
      confidence,
      rationale: parsed.rationale || fallbackDecision.rationale,
    };
  }

  /**
   * Decide la estrategia de busqueda para plan free: reutilizar cache o forzar fresh.
   * Si IA no esta disponible, usa un fallback local conservador.
   */
  async decideFreeSearchStrategy(input: {
    cacheCount: number;
    hasNextPageToken: boolean;
    cacheAgeMinutes: number | null;
    cityMatchRatio: number;
    role?: string | null;
    location?: string | null;
    targetResults: number;
  }): Promise<FreeSearchStrategyDecision> {
    const hasCoverage = input.cacheCount >= input.targetResults;
    const fallback: FreeSearchStrategyDecision = {
      strategy: hasCoverage ? 'reuse_cache' : 'force_fresh',
      confidence: 0.6,
      rationale: hasCoverage
        ? 'Fallback local: cache con cobertura suficiente.'
        : 'Fallback local: cache insuficiente, se fuerza busqueda nueva.',
    };

    const systemPrompt = [
      'Eres un decisor de estrategia de busqueda para plan free en un bot de empleo.',
      'Responde SOLO JSON valido con: {"strategy":"reuse_cache|force_fresh","confidence":number,"rationale":string}.',
      'Criterio principal: si cacheCount >= targetResults, prefiere reuse_cache.',
      'Si cacheCount < targetResults, prefiere force_fresh.',
      'Usa hasNextPageToken, cacheAgeMinutes y cityMatchRatio como factores secundarios.',
      'confidence debe estar entre 0 y 1.',
    ].join('\n');

    const raw = await this.callOpenAI(systemPrompt, JSON.stringify(input));
    if (!raw) return fallback;

    const parsed = this.parseJSON<FreeSearchStrategyDecision>(raw, fallback);
    const strategy = parsed.strategy === 'reuse_cache' || parsed.strategy === 'force_fresh'
      ? parsed.strategy
      : fallback.strategy;
    const confidence = Number.isFinite(parsed.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence))
      : fallback.confidence;

    return {
      strategy,
      confidence,
      rationale: parsed.rationale || fallback.rationale,
    };
  }

  /**
   * Reordena candidatas de oferta para premium segun calidad global.
   * Si el LLM no esta disponible, usa el score local existente.
   */
  async rerankPremiumJobs(input: {
    role?: string | null;
    location?: string | null;
    experienceLevel?: string | null;
    jobs: Array<{
      title?: string | null;
      company?: string | null;
      locationRaw?: string | null;
      source?: string | null;
      snippet?: string | null;
      score?: number | null;
    }>;
  }): Promise<PremiumJobRerankResult | null> {
    if (input.jobs.length <= 1) {
      return {
        orderedIndexes: input.jobs.map((_, index) => index),
        rationale: 'No se requiere reordenamiento con una sola oferta.',
      };
    }

    const fallbackIndexes = input.jobs
      .map((job, index) => ({ index, score: typeof job.score === 'number' ? job.score : -1 }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.index);

    const fallback: PremiumJobRerankResult = {
      orderedIndexes: fallbackIndexes,
      rationale: 'Orden por score local al no disponer de IA.',
    };

    const systemPrompt = [
      'Eres un ranking engine para ofertas de empleo.',
      'Debes ordenar las ofertas de mayor a menor calidad para el usuario.',
      'Responde SOLO JSON valido con: {"orderedIndexes": number[], "rationale": string}.',
      'orderedIndexes debe incluir todos los indices exactamente una vez.',
      'Regla critica: prioriza con maxima fuerza la coincidencia de ciudad objetivo (location).',
      'Si una oferta coincide exactamente en ciudad con location, debe quedar por encima de ofertas de otras ciudades, salvo incompatibilidad extrema de rol.',
      'Luego prioriza relevancia del rol, seniority y calidad de fuente.',
    ].join('\n');

    const raw = await this.callOpenAI(systemPrompt, JSON.stringify(input));
    if (!raw) return fallback;

    const parsed = this.parseJSON<PremiumJobRerankResult>(raw, fallback);
    const used = new Set<number>();
    const validOrder: number[] = [];

    for (const maybeIndex of parsed.orderedIndexes || []) {
      if (!Number.isInteger(maybeIndex)) continue;
      if (maybeIndex < 0 || maybeIndex >= input.jobs.length) continue;
      if (used.has(maybeIndex)) continue;
      used.add(maybeIndex);
      validOrder.push(maybeIndex);
    }

    for (let index = 0; index < input.jobs.length; index += 1) {
      if (!used.has(index)) {
        validOrder.push(index);
      }
    }

    return {
      orderedIndexes: validOrder.length > 0 ? validOrder : fallback.orderedIndexes,
      rationale: parsed.rationale || fallback.rationale,
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
