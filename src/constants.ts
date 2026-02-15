export const API_VERSION = 1;

export enum StreamID {
  Stdout = 0x01,
  Stderr = 0x02,
  Stdin  = 0x03,
  Resize = 0x04,
}

export const MAX_ENV_VARS = 64;
export const MAX_ENV_VALUE_LEN = 32 * 1024; // 32 KiB
export const DEFAULT_TIMEOUT_MS = 30_000;
export const WS_PING_INTERVAL_MS = 30_000;
export const TOKEN_PREFIX = 'noid_tok_';
