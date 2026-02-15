import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { StreamID, WS_PING_INTERVAL_MS } from '../constants.js';
import { NoidConnectionError } from '../errors.js';

/**
 * Low-level WebSocket wrapper for noid binary protocol.
 *
 * Emits:
 * - 'stdout' (Buffer) — data from CHANNEL_STDOUT (0x01)
 * - 'stderr' (Buffer) — data from CHANNEL_STDERR (0x02)
 * - 'message' (string) — text frames (JSON: ExecResult, ErrorResponse)
 * - 'close' — connection closed
 * - 'error' (Error) — connection error
 */
export class NoidWebSocket extends EventEmitter {
  private readonly url: string;
  private readonly token: string;
  private ws?: WebSocket;
  private pingInterval?: ReturnType<typeof setInterval>;

  constructor(url: string, token: string) {
    super();
    this.url = url;
    this.token = token;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      this.ws.on('open', () => {
        this.startKeepalive();
        resolve();
      });

      this.ws.on('error', (err: Error) => {
        reject(new NoidConnectionError(`WebSocket error: ${err.message}`, { cause: err }));
      });

      this.ws.on('close', () => {
        this.stopKeepalive();
        this.emit('close');
      });

      this.ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        if (!isBinary) {
          // Text frame — JSON messages (ExecResult, ErrorResponse, etc.)
          this.emit('message', data.toString());
          return;
        }

        // Binary frame — channel protocol: [channel_byte][...payload]
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (buf.length < 1) return;

        const channel = buf[0];
        const payload = buf.subarray(1);

        switch (channel) {
          case StreamID.Stdout:
            this.emit('stdout', payload);
            break;
          case StreamID.Stderr:
            this.emit('stderr', payload);
            break;
          default:
            break;
        }
      });
    });
  }

  /** Send binary frame */
  send(data: Buffer | Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  /** Send text frame */
  sendText(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  close(): void {
    this.stopKeepalive();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close(1000);
    }
  }

  private startKeepalive(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, WS_PING_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }
}
