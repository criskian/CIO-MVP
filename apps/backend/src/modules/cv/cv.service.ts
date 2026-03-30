import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import axios from 'axios';
import OpenAI from 'openai';
import { inflateRawSync } from 'zlib';

type CvSourceType = 'pdf' | 'docx' | 'doc' | 'image' | 'unknown';
type CvExperienceLevel = 'none' | 'junior' | 'mid' | 'senior' | 'lead';
type CvMissingField = 'role' | 'experienceLevel' | 'location';
export type CvWarningCode =
  | 'MEDIA_METADATA_FAILED'
  | 'MEDIA_DOWNLOAD_FAILED'
  | 'UNSUPPORTED_MIME'
  | 'OPENAI_UNAVAILABLE'
  | 'OPENAI_PARSE_FAILED'
  | 'DOC_PARSE_FAILED';

interface WhatsAppMediaMetadata {
  id: string;
  url: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
}

export interface CvProfileExtractionResult {
  role: string | null;
  experienceLevel: CvExperienceLevel | null;
  location: string | null;
  confidence: number;
  missingFields: CvMissingField[];
  sourceType: CvSourceType;
  warningCode?: CvWarningCode;
  warningMessage?: string | null;
  mimeType?: string | null;
}

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);
  private readonly openai: OpenAI | null;
  private readonly whatsappToken: string;
  private readonly whatsappApiUrl: string;
  private readonly cvModel: string;
  private readonly maxOpenAIFileBytes = 50 * 1024 * 1024;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.whatsappToken = this.configService.get<string>('WHATSAPP_TOKEN', '');
    this.whatsappApiUrl = this.configService.get<string>(
      'WHATSAPP_GRAPH_API_URL',
      'https://graph.facebook.com/v18.0',
    );
    this.cvModel = this.configService.get<string>('OPENAI_CV_MODEL', 'gpt-4o-mini');

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async processCvFromUrl(
    userId: string,
    mediaIdOrUrl: string,
  ): Promise<CvProfileExtractionResult> {
    this.logger.log(`Processing CV for user ${userId}: ${mediaIdOrUrl}`);

    const empty = this.buildEmptyResult('unknown');

    const mediaResolved = await this.resolveMedia(mediaIdOrUrl);
    if (!mediaResolved || 'errorCode' in mediaResolved) {
      const warningCode = mediaResolved?.errorCode || 'MEDIA_METADATA_FAILED';
      const warningMessage =
        mediaResolved?.errorMessage
        || 'No pude leer el archivo desde WhatsApp. Reenvialo, por favor.';

      return await this.persistAndReturn(
        userId,
        mediaIdOrUrl,
        {
          ...empty,
          warningCode,
          warningMessage,
        },
      );
    }

    const detectedMime = this.detectMimeType(mediaResolved.buffer, mediaResolved.mimeType);
    const sourceType = this.detectSourceType(detectedMime, mediaResolved.buffer);
    const baseResult = this.buildEmptyResult(sourceType, detectedMime);

    let extracted: CvProfileExtractionResult;

    switch (sourceType) {
      case 'pdf':
        extracted = await this.extractFromPdf(mediaResolved.buffer, detectedMime, mediaIdOrUrl);
        break;
      case 'docx':
        extracted = await this.extractFromDocx(mediaResolved.buffer, mediaIdOrUrl);
        break;
      case 'doc':
        extracted = await this.extractFromDoc(mediaResolved.buffer, mediaIdOrUrl);
        break;
      case 'image':
        extracted = await this.extractFromImage(mediaResolved.buffer, detectedMime, mediaIdOrUrl);
        break;
      default:
        extracted = {
          ...baseResult,
          warningCode: 'UNSUPPORTED_MIME',
          warningMessage: 'Formato no soportado. Envia PDF, DOCX o imagen.',
        };
    }

    return await this.persistAndReturn(userId, mediaIdOrUrl, extracted);
  }

  private buildEmptyResult(
    sourceType: CvSourceType,
    mimeType: string | null = null,
  ): CvProfileExtractionResult {
    return {
      role: null,
      experienceLevel: null,
      location: null,
      confidence: 0,
      missingFields: ['role', 'experienceLevel', 'location'],
      sourceType,
      mimeType,
    };
  }

  private async resolveMedia(mediaIdOrUrl: string): Promise<
  | {
    buffer: Buffer;
    mimeType: string | null;
    metadata: WhatsAppMediaMetadata | null;
  }
  | {
    errorCode: CvWarningCode;
    errorMessage: string;
  }
  | null
  > {
    try {
      if (/^https?:\/\//i.test(mediaIdOrUrl)) {
        const directDownload = await this.downloadMediaFile(mediaIdOrUrl);
        if (!directDownload) {
          return {
            errorCode: 'MEDIA_DOWNLOAD_FAILED',
            errorMessage: 'No pude descargar ese archivo. Reenvialo, por favor.',
          };
        }
        return {
          buffer: directDownload.buffer,
          mimeType: directDownload.mimeType,
          metadata: null,
        };
      }

      const metadata = await this.fetchWhatsAppMediaMetadata(mediaIdOrUrl);
      if (!metadata?.url) {
        this.logger.warn(`No temporary URL returned for mediaId ${mediaIdOrUrl}`);
        return {
          errorCode: 'MEDIA_METADATA_FAILED',
          errorMessage: 'No pude recuperar la URL temporal del archivo. Reenvialo, por favor.',
        };
      }

      const download = await this.downloadMediaFile(metadata.url);
      if (!download) {
        return {
          errorCode: 'MEDIA_DOWNLOAD_FAILED',
          errorMessage: 'No pude descargar el archivo temporal de WhatsApp. Reenvialo, por favor.',
        };
      }

      return {
        buffer: download.buffer,
        mimeType: metadata.mime_type || download.mimeType,
        metadata,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error resolving WhatsApp media: ${message}`);
      return {
        errorCode: 'MEDIA_METADATA_FAILED',
        errorMessage: 'No pude procesar el archivo recibido. Reenvialo, por favor.',
      };
    }
  }

  private async fetchWhatsAppMediaMetadata(mediaId: string): Promise<WhatsAppMediaMetadata | null> {
    if (!this.whatsappToken) {
      this.logger.warn('WHATSAPP_TOKEN missing; cannot fetch media metadata.');
      return null;
    }

    try {
      const response = await axios.get<WhatsAppMediaMetadata>(
        `${this.whatsappApiUrl}/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${this.whatsappToken}`,
          },
          timeout: 20000,
        },
      );

      return response.data || null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to fetch media metadata (${mediaId}): ${message}`);
      return null;
    }
  }

  private async downloadMediaFile(url: string): Promise<{
    buffer: Buffer;
    mimeType: string | null;
  } | null> {
    try {
      const headers: Record<string, string> = {};
      if (this.whatsappToken) {
        headers.Authorization = `Bearer ${this.whatsappToken}`;
      }

      const response = await axios.get<ArrayBuffer>(url, {
        headers,
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      return {
        buffer: Buffer.from(response.data),
        mimeType: this.extractMimeFromHeader(response.headers['content-type']),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to download media file: ${message}`);
      return null;
    }
  }

  private extractMimeFromHeader(contentTypeHeader: unknown): string | null {
    if (typeof contentTypeHeader !== 'string') return null;
    const mime = contentTypeHeader.split(';')[0]?.trim().toLowerCase();
    return mime || null;
  }

  private detectMimeType(buffer: Buffer, declaredMimeType: string | null): string | null {
    const mime = declaredMimeType?.trim().toLowerCase() || null;

    if (mime) {
      return mime;
    }

    const header = buffer.subarray(0, 8);
    const asAscii = header.toString('ascii');

    if (asAscii.startsWith('%PDF-')) return 'application/pdf';
    if (header[0] === 0xff && header[1] === 0xd8) return 'image/jpeg';
    if (
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47
    ) return 'image/png';
    if (
      header[0] === 0x47 &&
      header[1] === 0x49 &&
      header[2] === 0x46 &&
      header[3] === 0x38
    ) return 'image/gif';

    if (this.looksLikeDocx(buffer)) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    return null;
  }

  private detectSourceType(mimeType: string | null, buffer: Buffer): CvSourceType {
    const mime = mimeType || '';

    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('image/')) return 'image';

    if (
      mime.includes('wordprocessingml.document')
      || mime.includes('vnd.openxmlformats-officedocument')
    ) return 'docx';

    if (
      mime === 'application/msword'
      || mime.includes('vnd.ms-word')
      || mime.includes('word.document')
    ) return 'doc';

    if (this.looksLikeDocx(buffer)) return 'docx';
    if (this.looksLikeBinaryDoc(buffer)) return 'doc';

    return 'unknown';
  }

  private looksLikeDocx(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;
    if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) return false;

    const scan = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('latin1');
    return scan.includes('[Content_Types].xml') || scan.includes('word/');
  }

  private looksLikeBinaryDoc(buffer: Buffer): boolean {
    if (buffer.length < 8) return false;
    return (
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0 &&
      buffer[4] === 0xa1 &&
      buffer[5] === 0xb1 &&
      buffer[6] === 0x1a &&
      buffer[7] === 0xe1
    );
  }

  private async extractFromPdf(
    buffer: Buffer,
    mimeType: string | null,
    mediaRef: string,
  ): Promise<CvProfileExtractionResult> {
    if (!this.openai) {
      return {
        ...this.buildEmptyResult('pdf', mimeType),
        warningCode: 'OPENAI_UNAVAILABLE',
        warningMessage: 'No pude procesar el PDF ahora. Intenta de nuevo o envia DOCX.',
      };
    }

    if (buffer.length > this.maxOpenAIFileBytes) {
      return {
        ...this.buildEmptyResult('pdf', mimeType),
        warningCode: 'UNSUPPORTED_MIME',
        warningMessage: 'El PDF supera el tamano soportado. Envia una version mas liviana.',
      };
    }

    const prompt = this.buildCvExtractionPrompt('PDF');
    const safeMime = mimeType || 'application/pdf';
    const base64DataUrl = `data:${safeMime};base64,${buffer.toString('base64')}`;

    try {
      const response = await this.openai.responses.create({
        model: this.cvModel,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              {
                type: 'input_file',
                file_data: base64DataUrl,
                filename: this.buildSafeFilename('cv', mediaRef, 'pdf'),
              },
            ],
          },
        ],
        max_output_tokens: 400,
      });

      return this.parseCvJsonFromModelOutput(
        response.output_text || '',
        'pdf',
        safeMime,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`PDF multimodal extraction failed: ${message}`);
      return {
        ...this.buildEmptyResult('pdf', safeMime),
        warningCode: 'OPENAI_PARSE_FAILED',
        warningMessage: 'No pude leer bien ese PDF. Reenvialo en PDF o DOCX.',
      };
    }
  }

  private async extractFromImage(
    buffer: Buffer,
    mimeType: string | null,
    mediaRef: string,
  ): Promise<CvProfileExtractionResult> {
    if (!this.openai) {
      return {
        ...this.buildEmptyResult('image', mimeType),
        warningCode: 'OPENAI_UNAVAILABLE',
        warningMessage: 'No pude procesar la imagen ahora. Intenta de nuevo.',
      };
    }

    if (buffer.length > this.maxOpenAIFileBytes) {
      return {
        ...this.buildEmptyResult('image', mimeType),
        warningCode: 'UNSUPPORTED_MIME',
        warningMessage: 'La imagen supera el tamano soportado. Envia una imagen mas liviana.',
      };
    }

    const prompt = `${this.buildCvExtractionPrompt('IMAGE')} Prioritize detailed reading, including handwritten text when legible.`;
    const safeMime = mimeType || 'image/jpeg';
    const dataUrl = `data:${safeMime};base64,${buffer.toString('base64')}`;

    try {
      const response = await this.openai.responses.create({
        model: this.cvModel,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              {
                type: 'input_image',
                image_url: dataUrl,
                detail: 'high',
              },
            ],
          },
        ],
        max_output_tokens: 400,
      });

      return this.parseCvJsonFromModelOutput(
        response.output_text || '',
        'image',
        safeMime,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Image multimodal extraction failed: ${message}`);
      return {
        ...this.buildEmptyResult('image', safeMime),
        warningCode: 'OPENAI_PARSE_FAILED',
        warningMessage: 'No pude interpretar bien la imagen. Envia una foto mas clara o un PDF.',
      };
    }
  }

  private async extractFromDocx(
    buffer: Buffer,
    mediaRef: string,
  ): Promise<CvProfileExtractionResult> {
    const extractedText = this.extractTextFromDocxBuffer(buffer);
    if (!extractedText || extractedText.length < 50) {
      return {
        ...this.buildEmptyResult(
          'docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
        warningCode: 'DOC_PARSE_FAILED',
        warningMessage: 'No pude extraer texto del DOCX. Reenvialo en PDF o comparte los datos manualmente.',
      };
    }

    return await this.extractFromPlainText(
      extractedText,
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      mediaRef,
    );
  }

  private async extractFromDoc(
    buffer: Buffer,
    mediaRef: string,
  ): Promise<CvProfileExtractionResult> {
    const extractedText = this.extractTextFromDocBuffer(buffer);
    if (!extractedText || extractedText.length < 80) {
      return {
        ...this.buildEmptyResult('doc', 'application/msword'),
        warningCode: 'DOC_PARSE_FAILED',
        warningMessage: 'No pude leer ese archivo DOC. Reenvialo en PDF o DOCX.',
      };
    }

    return await this.extractFromPlainText(
      extractedText,
      'doc',
      'application/msword',
      mediaRef,
    );
  }

  private async extractFromPlainText(
    sourceText: string,
    sourceType: CvSourceType,
    mimeType: string,
    _mediaRef: string,
  ): Promise<CvProfileExtractionResult> {
    if (!this.openai) {
      return {
        ...this.buildEmptyResult(sourceType, mimeType),
        warningCode: 'OPENAI_UNAVAILABLE',
        warningMessage: 'No pude usar IA para extraer datos ahora. Intenta mas tarde.',
      };
    }

    const trimmed = sourceText.trim();
    const maxChars = 20000;
    const textForModel = trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed;

    const prompt = `${this.buildCvExtractionPrompt(sourceType.toUpperCase())}\n\nCV content:\n${textForModel}`;

    try {
      const response = await this.openai.responses.create({
        model: this.cvModel,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
            ],
          },
        ],
        max_output_tokens: 400,
      });

      return this.parseCvJsonFromModelOutput(
        response.output_text || '',
        sourceType,
        mimeType,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Text CV extraction failed (${sourceType}): ${message}`);
      return {
        ...this.buildEmptyResult(sourceType, mimeType),
        warningCode: 'OPENAI_PARSE_FAILED',
        warningMessage: 'No pude extraer datos claros de ese archivo. Intenta con un PDF o imagen mas legible.',
      };
    }
  }

  private buildCvExtractionPrompt(sourceLabel: string): string {
    return [
      `You extract job profile data from a resume source (${sourceLabel}).`,
      'Return ONLY valid JSON with this exact schema:',
      '{"role":string|null,"experienceLevel":"none"|"junior"|"mid"|"senior"|"lead"|null,"location":string|null,"confidence":number}',
      'Rules:',
      '- role: main target role.',
      '- experienceLevel: none/junior/mid/senior/lead from total experience.',
      '- location: main city or country for job search (if unclear, null).',
      '- confidence: number from 0 to 1.',
      '- Use null for missing fields.',
      '- No extra text outside JSON.',
    ].join('\n');
  }

  private parseCvJsonFromModelOutput(
    outputText: string,
    sourceType: CvSourceType,
    mimeType: string | null,
  ): CvProfileExtractionResult {
    const empty = this.buildEmptyResult(sourceType, mimeType);
    const parsed = this.tryParseJson(outputText);
    if (!parsed) {
      return {
        ...empty,
        warningCode: 'OPENAI_PARSE_FAILED',
        warningMessage: 'No pude interpretar la salida automatica de extraccion.',
      };
    }

    const role = this.normalizeRole(parsed.role);
    const experienceLevel = this.normalizeExperienceLevel(parsed.experienceLevel);
    const location = this.normalizeLocation(parsed.location);
    const confidence = this.normalizeConfidence(parsed.confidence, role, experienceLevel, location);
    const missingFields = this.buildMissingFields(role, experienceLevel, location);

    return {
      role,
      experienceLevel,
      location,
      confidence,
      missingFields,
      sourceType,
      mimeType,
    };
  }

  private tryParseJson(text: string): any | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    try {
      return JSON.parse(trimmed);
    } catch {
      // fallback
    }

    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  private normalizeRole(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized || normalized.length < 2) return null;
    return normalized.slice(0, 120);
  }

  private normalizeLocation(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized || normalized.length < 2) return null;
    return normalized.slice(0, 120);
  }

  private normalizeExperienceLevel(value: unknown): CvExperienceLevel | null {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    const direct: Record<string, CvExperienceLevel> = {
      none: 'none',
      no_experience: 'none',
      sin_experiencia: 'none',
      trainee: 'none',
      intern: 'none',
      junior: 'junior',
      jr: 'junior',
      mid: 'mid',
      middle: 'mid',
      intermedio: 'mid',
      senior: 'senior',
      sr: 'senior',
      lead: 'lead',
      expert: 'lead',
      principal: 'lead',
    };

    if (direct[v]) return direct[v];
    return null;
  }

  private normalizeConfidence(
    value: unknown,
    role: string | null,
    experienceLevel: CvExperienceLevel | null,
    location: string | null,
  ): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.min(1, value));
    }

    const presentCount = [role, experienceLevel, location].filter(Boolean).length;
    if (presentCount === 3) return 0.9;
    if (presentCount === 2) return 0.75;
    if (presentCount === 1) return 0.6;
    return 0;
  }

  private buildMissingFields(
    role: string | null,
    experienceLevel: CvExperienceLevel | null,
    location: string | null,
  ): CvMissingField[] {
    const missing: CvMissingField[] = [];
    if (!role) missing.push('role');
    if (!experienceLevel) missing.push('experienceLevel');
    if (!location) missing.push('location');
    return missing;
  }

  private async persistAndReturn(
    userId: string,
    mediaReference: string,
    extraction: CvProfileExtractionResult,
  ): Promise<CvProfileExtractionResult> {
    const profileData: Record<string, any> = {
      createdFromCV: true,
      cvUrl: this.buildCvReference(mediaReference),
    };

    if (extraction.role) profileData.role = extraction.role;
    if (extraction.location) profileData.location = extraction.location;
    if (extraction.experienceLevel) profileData.experienceLevel = extraction.experienceLevel;

    await this.prisma.userProfile.upsert({
      where: { userId },
      update: profileData,
      create: {
        userId,
        ...profileData,
      },
    });

    this.logger.log(
      `CV processed for ${userId}: role=${extraction.role || '-'}, exp=${extraction.experienceLevel || '-'}, location=${extraction.location || '-'}, missing=${extraction.missingFields.join(',') || 'none'}`,
    );

    return extraction;
  }

  private buildCvReference(mediaReference: string): string {
    if (!mediaReference) return 'whatsapp-media:unknown';
    if (/^https?:\/\//i.test(mediaReference)) return mediaReference;
    return `whatsapp-media:${mediaReference}`;
  }

  private buildSafeFilename(prefix: string, mediaRef: string, ext: string): string {
    const token = mediaRef.replace(/[^a-zA-Z0-9_-]/g, '').slice(-24) || Date.now().toString();
    return `${prefix}_${token}.${ext}`;
  }

  private extractTextFromDocxBuffer(buffer: Buffer): string {
    try {
      const xmlParts: string[] = [];
      let offset = 0;

      while (offset + 30 <= buffer.length) {
        const signature = buffer.readUInt32LE(offset);
        if (signature !== 0x04034b50) break;

        const generalPurposeBitFlag = buffer.readUInt16LE(offset + 6);
        const compressionMethod = buffer.readUInt16LE(offset + 8);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const fileNameLength = buffer.readUInt16LE(offset + 26);
        const extraFieldLength = buffer.readUInt16LE(offset + 28);

        const fileNameStart = offset + 30;
        const fileNameEnd = fileNameStart + fileNameLength;
        if (fileNameEnd > buffer.length) break;

        const fileName = buffer.toString('utf8', fileNameStart, fileNameEnd);
        const dataStart = fileNameEnd + extraFieldLength;

        if ((generalPurposeBitFlag & 0x08) !== 0 || compressedSize <= 0) {
          break;
        }

        const dataEnd = dataStart + compressedSize;
        if (dataEnd > buffer.length) break;

        if (
          fileName === 'word/document.xml'
          || fileName.startsWith('word/header')
          || fileName.startsWith('word/footer')
        ) {
          const compressedData = buffer.subarray(dataStart, dataEnd);
          let xmlBuffer: Buffer;

          if (compressionMethod === 0) {
            xmlBuffer = Buffer.from(compressedData);
          } else if (compressionMethod === 8) {
            xmlBuffer = inflateRawSync(compressedData);
          } else {
            xmlBuffer = Buffer.alloc(0);
          }

          if (xmlBuffer.length > 0) {
            xmlParts.push(xmlBuffer.toString('utf8'));
          }
        }

        offset = dataEnd;
      }

      if (!xmlParts.length) return '';

      const joinedXml = xmlParts.join('\n');
      const rawText = joinedXml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:br\s*\/>/g, '\n')
        .replace(/<w:tab\s*\/>/g, '\t')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return this.decodeXmlEntities(rawText);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Could not extract DOCX text locally: ${message}`);
      return '';
    }
  }

  private extractTextFromDocBuffer(buffer: Buffer): string {
    try {
      const utf16 = buffer.toString('utf16le');
      const latin = buffer.toString('latin1');

      const utf16Text = this.pickReadableChunks(utf16);
      const latinText = this.pickReadableChunks(latin);

      const combined = `${utf16Text}\n${latinText}`
        .replace(/\s+/g, ' ')
        .trim();

      return combined.slice(0, 30000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Could not extract DOC text locally: ${message}`);
      return '';
    }
  }

  private pickReadableChunks(input: string): string {
    if (!input) return '';

    const chunks = input.match(/[A-Za-z0-9.,;:()\-_/+@#%\s]{4,}/g) || [];
    const filtered = chunks
      .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
      .filter((chunk) => chunk.length >= 4)
      .slice(0, 600);

    return filtered.join(' ');
  }

  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'");
  }
}
