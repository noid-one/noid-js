import type { ExecResult } from './types.js';

/** Base error for all noid-js errors */
export class NoidError extends Error {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = 'NoidError';
  }
}

/** HTTP API errors (4xx, 5xx responses) */
export class NoidAPIError extends NoidError {
  readonly statusCode: number;
  readonly errorMessage: string;

  constructor(statusCode: number, errorMessage: string) {
    super(`API error ${statusCode}: ${errorMessage}`);
    this.name = 'NoidAPIError';
    this.statusCode = statusCode;
    this.errorMessage = errorMessage;
  }

  isNotFound(): boolean {
    return this.statusCode === 404;
  }
  isConflict(): boolean {
    return this.statusCode === 409;
  }
  isUnauthorized(): boolean {
    return this.statusCode === 401;
  }
  isRateLimited(): boolean {
    return this.statusCode === 429;
  }
}

/** Command execution errors (non-zero exit) */
export class NoidExecError extends NoidError {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly timedOut: boolean;
  readonly truncated: boolean;

  constructor(result: ExecResult) {
    const msg = result.timed_out
      ? 'Command timed out'
      : `Command failed with exit code ${result.exit_code}`;
    super(msg);
    this.name = 'NoidExecError';
    this.exitCode = result.exit_code;
    this.stdout = result.stdout;
    this.timedOut = result.timed_out;
    this.truncated = result.truncated;
  }
}

/** WebSocket / network connectivity errors */
export class NoidConnectionError extends NoidError {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = 'NoidConnectionError';
  }
}

/** Input validation errors (client-side) */
export class NoidValidationError extends NoidError {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`Validation error on '${field}': ${message}`);
    this.name = 'NoidValidationError';
    this.field = field;
  }
}
