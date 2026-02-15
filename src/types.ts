export interface NoidClientOptions {
  /** Server base URL (e.g., "https://noid.example.com") */
  baseUrl: string;
  /** Authentication token (format: noid_tok_...) */
  token: string;
  /** Request timeout in milliseconds (default: 30_000) */
  timeout?: number;
}

export interface VmInfo {
  name: string;
  state: 'running' | 'paused' | 'stopped' | 'unknown';
  cpus: number;
  mem_mib: number;
  created_at: string;
}

export interface CreateVmOptions {
  /** Number of vCPUs (default: 1) */
  cpus?: number;
  /** Memory in MiB (default: 2048) */
  memMib?: number;
}

export interface ExecOptions {
  /** Environment variables to inject */
  env?: EnvVars;
  /** Request TTY allocation */
  tty?: boolean;
  /** Timeout in seconds (server-enforced, default from capabilities) */
  timeout?: number;
}

export interface ExecResult {
  stdout: string;
  exit_code: number | null;
  timed_out: boolean;
  truncated: boolean;
}

export interface SpawnOptions {
  /** Environment variables to inject */
  env?: EnvVars;
  /** Request TTY allocation */
  tty?: boolean;
  /** TTY dimensions */
  rows?: number;
  cols?: number;
}

/** Environment variables as key-value object */
export type EnvVars = Record<string, string>;

export interface ConsoleOptions {
  /** Environment variables to inject */
  env?: EnvVars;
  /** TTY rows (default: 24) */
  rows?: number;
  /** TTY cols (default: 80) */
  cols?: number;
}

export interface CheckpointInfo {
  id: string;
  vm_name: string;
  label: string | null;
  created_at: string;
}

export interface CreateCheckpointOptions {
  /** Human-readable label */
  label?: string;
}

export interface RestoreOptions {
  /** Name for the restored VM (default: overwrites original) */
  newName?: string;
}

export interface VersionInfo {
  version: string;
  api_version: number;
}

export interface WhoamiResponse {
  user_id: string;
  name: string;
}

export interface Capabilities {
  api_version: number;
  max_exec_output_bytes: number;
  timeouts: {
    exec_timeout_secs: number;
    console_timeout_secs: number;
  };
  limits: {
    max_env_vars: number;
    max_env_value_len: number;
  };
  defaults: {
    cpus: number;
    mem_mib: number;
  };
}
