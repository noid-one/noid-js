import { EventEmitter } from 'node:events';
import { Readable, Writable, PassThrough } from 'node:stream';
import type { Vm } from './vm.js';
import type { SpawnOptions, ExecResult } from './types.js';
import { NoidWebSocket } from './internal/websocket.js';
import { StreamID } from './constants.js';

export class VmCommand extends EventEmitter {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;

  private readonly vm: Vm;
  private readonly command: string[];
  private readonly options?: SpawnOptions;
  private ws?: NoidWebSocket;
  private _exitCode: number = -1;
  private exitPromise: Promise<number>;
  private resolveExit!: (code: number) => void;

  constructor(vm: Vm, command: string[], options?: SpawnOptions) {
    super();
    this.vm = vm;
    this.command = command;
    this.options = options;

    const stdinPassthrough = new PassThrough();
    const stdoutPassthrough = new PassThrough();
    const stderrPassthrough = new PassThrough();

    this.stdin = stdinPassthrough;
    this.stdout = stdoutPassthrough;
    this.stderr = stderrPassthrough;

    this.exitPromise = new Promise<number>((resolve) => {
      this.resolveExit = resolve;
    });
  }

  private buildUrl(): string {
    return this.vm.client.wsUrl(
      `/v1/vms/${encodeURIComponent(this.vm.name)}/exec`
    );
  }

  private buildExecRequest(): string {
    const env = this.options?.env
      ? Object.entries(this.options.env).map(([k, v]) => `${k}=${v}`)
      : [];

    return JSON.stringify({
      command: this.command,
      tty: this.options?.tty ?? false,
      env,
    });
  }

  /** Connect WebSocket and begin streaming. */
  async start(): Promise<void> {
    const url = this.buildUrl();
    this.ws = new NoidWebSocket(url, this.vm.client.token);

    this.ws.on('stdout', (data: Buffer) => {
      (this.stdout as PassThrough).write(data);
    });

    this.ws.on('stderr', (data: Buffer) => {
      (this.stderr as PassThrough).write(data);
    });

    this.ws.on('message', (text: string) => {
      try {
        const parsed = JSON.parse(text);

        if ('exit_code' in parsed || 'timed_out' in parsed) {
          const result = parsed as ExecResult;
          const code = result.timed_out ? 124 : (result.exit_code ?? 0);
          this._exitCode = code;
          (this.stdout as PassThrough).end();
          (this.stderr as PassThrough).end();
          this.resolveExit(code);
          this.emit('exit', code);
          return;
        }

        if ('error' in parsed) {
          this.emit('error', new Error(parsed.error));
          return;
        }
      } catch {
        // Non-JSON text frame — ignore
      }
    });

    this.ws.on('error', (err: Error) => {
      this.emit('error', err);
    });

    this.ws.on('close', () => {
      if (this._exitCode === -1) {
        (this.stdout as PassThrough).end();
        (this.stderr as PassThrough).end();
        this.resolveExit(-1);
      }
    });

    await this.ws.connect();

    this.ws.sendText(this.buildExecRequest());

    this.emit('spawn');
  }

  /** Wait for command to exit. Returns exit code. */
  async wait(): Promise<number> {
    return this.exitPromise;
  }

  /** Get current exit code (-1 if not yet exited). */
  exitCode(): number {
    return this._exitCode;
  }

  /** Resize TTY. Reserved — noid-server does not handle resize for exec. */
  resize(_cols: number, _rows: number): void {
    // Reserved for future use.
  }
}
