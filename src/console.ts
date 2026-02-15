import { EventEmitter } from 'node:events';
import { Readable, Writable, PassThrough } from 'node:stream';
import type { Vm } from './vm.js';
import type { ConsoleOptions, EnvVars } from './types.js';
import { NoidWebSocket } from './internal/websocket.js';
import { StreamID } from './constants.js';

export class VmConsole extends EventEmitter {
  readonly stdin: Writable;
  readonly stdout: Readable;

  private readonly vm: Vm;
  private readonly options?: ConsoleOptions;
  private ws?: NoidWebSocket;

  constructor(vm: Vm, options?: ConsoleOptions) {
    super();
    this.vm = vm;
    this.options = options;

    const stdinPassthrough = new PassThrough();
    const stdoutPassthrough = new PassThrough();

    this.stdin = stdinPassthrough;
    this.stdout = stdoutPassthrough;

    // Pipe stdin writes to WebSocket with CHANNEL_STDIN prefix
    stdinPassthrough.on('data', (chunk: Buffer) => {
      if (this.ws) {
        const frame = Buffer.alloc(1 + chunk.length);
        frame[0] = StreamID.Stdin;
        chunk.copy(frame, 1);
        this.ws.send(frame);
      }
    });
  }

  private buildUrl(): string {
    return this.vm.client.wsUrl(
      `/v1/vms/${encodeURIComponent(this.vm.name)}/console`
    );
  }

  /**
   * Inject environment variables by sending shell export commands through stdin.
   * Leading space prevents commands from appearing in shell history.
   */
  private async injectEnvVars(env: EnvVars): Promise<void> {
    for (const [key, value] of Object.entries(env)) {
      const escaped = value.replace(/'/g, "'\\''");
      const cmd = ` export ${key}='${escaped}'\r`;
      this.sendRawStdin(Buffer.from(cmd));
    }

    // Send a sync marker and wait for it to echo back
    const marker = `__NOID_ENV_SYNC_${Date.now().toString(16)}__`;
    this.sendRawStdin(Buffer.from(` echo ${marker}\r`));

    return new Promise<void>((resolve) => {
      let buf = '';
      const timeout = setTimeout(() => {
        this.ws?.removeListener('stdout', onData);
        resolve(); // Resolve even if sync fails (best-effort)
      }, 3000);

      const onData = (data: Buffer) => {
        buf += data.toString();
        if (buf.includes(marker)) {
          clearTimeout(timeout);
          this.ws?.removeListener('stdout', onData);
          resolve();
        }
      };

      this.ws?.on('stdout', onData);
    });
  }

  /** Send raw bytes to stdin (with CHANNEL_STDIN prefix) */
  private sendRawStdin(data: Buffer): void {
    if (this.ws) {
      const frame = Buffer.alloc(1 + data.length);
      frame[0] = StreamID.Stdin;
      data.copy(frame, 1);
      this.ws.send(frame);
    }
  }

  /** Connect WebSocket console session. */
  async start(): Promise<void> {
    const url = this.buildUrl();
    this.ws = new NoidWebSocket(url, this.vm.client.token);

    this.ws.on('stdout', (data: Buffer) => {
      (this.stdout as PassThrough).write(data);
    });

    this.ws.on('close', () => {
      (this.stdout as PassThrough).end();
      this.emit('close');
    });

    this.ws.on('error', (err: Error) => {
      this.emit('error', err);
    });

    await this.ws.connect();

    // Inject env vars client-side (if provided) before emitting 'open'
    if (this.options?.env && Object.keys(this.options.env).length > 0) {
      await this.injectEnvVars(this.options.env);
    }

    this.emit('open');
  }

  /** Disconnect console session. */
  close(): void {
    this.ws?.close();
  }

  /**
   * Resize TTY.
   * NOTE: noid-server does not currently handle resize messages.
   */
  resize(_cols: number, _rows: number): void {
    // Reserved — server does not process resize frames yet.
  }
}
