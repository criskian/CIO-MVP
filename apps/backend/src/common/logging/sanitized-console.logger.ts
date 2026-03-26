import { ConsoleLogger, LoggerService } from '@nestjs/common';
import { sanitizeUnknownForLogs } from '../text/mojibake.util';

export class SanitizedConsoleLogger extends ConsoleLogger implements LoggerService {
  private sanitizeArgs(args: unknown[]): unknown[] {
    return args.map((arg) => sanitizeUnknownForLogs(arg));
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(sanitizeUnknownForLogs(message), ...this.sanitizeArgs(optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(sanitizeUnknownForLogs(message), ...this.sanitizeArgs(optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(sanitizeUnknownForLogs(message), ...this.sanitizeArgs(optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(sanitizeUnknownForLogs(message), ...this.sanitizeArgs(optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(sanitizeUnknownForLogs(message), ...this.sanitizeArgs(optionalParams));
  }
}

