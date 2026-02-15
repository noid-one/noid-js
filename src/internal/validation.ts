import { NoidValidationError } from '../errors.js';
import { MAX_ENV_VARS, MAX_ENV_VALUE_LEN } from '../constants.js';
import type { EnvVars } from '../types.js';

const VM_NAME_MAX_LEN = 64;
const ENV_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateVmName(name: string): void {
  if (!name || name.length === 0) {
    throw new NoidValidationError('name', 'VM name cannot be empty');
  }
  if (name.length > VM_NAME_MAX_LEN) {
    throw new NoidValidationError('name', `VM name must be at most ${VM_NAME_MAX_LEN} characters`);
  }
  if (name.includes('/') || name.includes('\\')) {
    throw new NoidValidationError('name', 'VM name cannot contain path separators');
  }
  if (name.includes('..')) {
    throw new NoidValidationError('name', 'VM name cannot contain ".."');
  }
  if (name.startsWith('-') || name.startsWith('.')) {
    throw new NoidValidationError('name', 'VM name cannot start with "-" or "."');
  }
}

export function validateEnvVars(env: EnvVars): void {
  const entries = Object.entries(env);

  if (entries.length > MAX_ENV_VARS) {
    throw new NoidValidationError('env', `Maximum ${MAX_ENV_VARS} environment variables allowed`);
  }

  for (const [key, value] of entries) {
    if (!ENV_NAME_REGEX.test(key)) {
      throw new NoidValidationError(
        'env',
        `Invalid environment variable name '${key}': must match [A-Za-z_][A-Za-z0-9_]*`
      );
    }
    if (typeof value !== 'string') {
      throw new NoidValidationError('env', `Environment variable '${key}' value must be a string`);
    }
    if (value.length > MAX_ENV_VALUE_LEN) {
      throw new NoidValidationError(
        'env',
        `Environment variable '${key}' value exceeds maximum length of ${MAX_ENV_VALUE_LEN} bytes`
      );
    }
  }
}

export function validateEnvName(name: string): boolean {
  return ENV_NAME_REGEX.test(name);
}
