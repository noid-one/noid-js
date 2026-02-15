import type {
  VmInfo,
  ExecOptions,
  ExecResult,
  SpawnOptions,
  ConsoleOptions,
  CheckpointInfo,
  CreateCheckpointOptions,
  RestoreOptions,
  EnvVars,
} from './types.js';
import type { NoidClient } from './client.js';
import { VmCommand } from './exec.js';
import { VmConsole } from './console.js';
import { validateEnvVars } from './internal/validation.js';

export class Vm {
  readonly name: string;
  readonly client: NoidClient;

  private _info?: VmInfo;

  constructor(name: string, client: NoidClient) {
    this.name = name;
    this.client = client;
  }

  /** @internal Update cached info */
  _setInfo(info: VmInfo): void {
    this._info = info;
  }

  /** Fetch current VM info from server. */
  async info(): Promise<VmInfo> {
    const info = await this.client.fetch<VmInfo>(
      'GET',
      `/v1/vms/${encodeURIComponent(this.name)}`
    );
    this._info = info;
    return info;
  }

  /** Destroy this VM. */
  async destroy(): Promise<void> {
    await this.client.fetch<void>(
      'DELETE',
      `/v1/vms/${encodeURIComponent(this.name)}`
    );
  }

  /**
   * Execute a command and capture output (HTTP).
   * Best for short-lived commands where you want the full result.
   */
  async exec(command: string[], options?: ExecOptions): Promise<ExecResult> {
    if (options?.env) validateEnvVars(options.env);

    const env = options?.env ? envToArray(options.env) : undefined;
    const body = {
      command,
      tty: options?.tty ?? false,
      env: env ?? [],
    };

    return this.client.fetch<ExecResult>(
      'POST',
      `/v1/vms/${encodeURIComponent(this.name)}/exec`,
      body
    );
  }

  /**
   * Spawn a command with streaming I/O (WebSocket).
   * Returns immediately — call .start() then use stdout/stderr streams.
   */
  spawn(command: string[], options?: SpawnOptions): VmCommand {
    if (options?.env) validateEnvVars(options.env);
    return new VmCommand(this, command, options);
  }

  /**
   * Attach an interactive console session (WebSocket).
   * Returns immediately — call .start() to connect.
   */
  console(options?: ConsoleOptions): VmConsole {
    if (options?.env) validateEnvVars(options.env);
    return new VmConsole(this, options);
  }

  // ─── Checkpoints ───

  async createCheckpoint(options?: CreateCheckpointOptions): Promise<CheckpointInfo> {
    return this.client.fetch<CheckpointInfo>(
      'POST',
      `/v1/vms/${encodeURIComponent(this.name)}/checkpoints`,
      { label: options?.label }
    );
  }

  async listCheckpoints(): Promise<CheckpointInfo[]> {
    return this.client.fetch<CheckpointInfo[]>(
      'GET',
      `/v1/vms/${encodeURIComponent(this.name)}/checkpoints`
    );
  }

  /**
   * Restore VM from a checkpoint.
   * Returns a Vm handle for the restored VM.
   */
  async restore(checkpointId: string, options?: RestoreOptions): Promise<Vm> {
    const body = {
      checkpoint_id: checkpointId,
      new_name: options?.newName,
    };
    const info = await this.client.fetch<VmInfo>(
      'POST',
      `/v1/vms/${encodeURIComponent(this.name)}/restore`,
      body
    );
    const restoredName = options?.newName ?? this.name;
    const vm = new Vm(restoredName, this.client);
    vm._setInfo(info);
    return vm;
  }
}

/** Convert { KEY: "value" } to ["KEY=value", ...] */
function envToArray(env: EnvVars): string[] {
  return Object.entries(env).map(([k, v]) => `${k}=${v}`);
}
