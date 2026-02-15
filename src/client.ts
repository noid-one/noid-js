import { Vm } from './vm.js';
import { request } from './internal/http.js';
import type {
  NoidClientOptions,
  VmInfo,
  CreateVmOptions,
  VersionInfo,
  WhoamiResponse,
  Capabilities,
} from './types.js';
import { validateVmName } from './internal/validation.js';
import { DEFAULT_TIMEOUT_MS, TOKEN_PREFIX } from './constants.js';
import { NoidValidationError } from './errors.js';

export class NoidClient {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeout: number;

  constructor(options: NoidClientOptions) {
    if (!options.token.startsWith(TOKEN_PREFIX)) {
      throw new NoidValidationError('token', `Token must start with '${TOKEN_PREFIX}'`);
    }

    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Get a VM handle without making a server call.
   * Use this when you already know the VM exists.
   */
  vm(name: string): Vm {
    validateVmName(name);
    return new Vm(name, this);
  }

  /**
   * Create a new VM on the server.
   * Returns a Vm handle populated with server-returned info.
   */
  async createVm(name: string, options?: CreateVmOptions): Promise<Vm> {
    validateVmName(name);
    const body = {
      name,
      cpus: options?.cpus,
      mem_mib: options?.memMib,
    };
    const info = await this.fetch<VmInfo>('POST', '/v1/vms', body);
    const vm = new Vm(name, this);
    vm._setInfo(info);
    return vm;
  }

  /**
   * Fetch VM info from server.
   * Returns a Vm handle populated with current state.
   */
  async getVm(name: string): Promise<Vm> {
    validateVmName(name);
    const info = await this.fetch<VmInfo>('GET', `/v1/vms/${encodeURIComponent(name)}`);
    const vm = new Vm(name, this);
    vm._setInfo(info);
    return vm;
  }

  /** List all VMs for the authenticated user. */
  async listVms(): Promise<VmInfo[]> {
    return this.fetch<VmInfo[]>('GET', '/v1/vms');
  }

  /** Destroy a VM by name. */
  async destroyVm(name: string): Promise<void> {
    validateVmName(name);
    await this.fetch<void>('DELETE', `/v1/vms/${encodeURIComponent(name)}`);
  }

  // ─── Server Info ───

  async health(): Promise<{ status: string }> {
    return request(this.baseUrl, {
      method: 'GET',
      path: '/healthz',
      timeout: this.timeout,
    });
  }

  async version(): Promise<VersionInfo> {
    return request(this.baseUrl, {
      method: 'GET',
      path: '/version',
      timeout: this.timeout,
    });
  }

  async whoami(): Promise<WhoamiResponse> {
    return this.fetch('GET', '/v1/whoami');
  }

  async capabilities(): Promise<Capabilities> {
    return this.fetch('GET', '/v1/capabilities');
  }

  // ─── Internal ───

  /** @internal Authenticated fetch helper */
  async fetch<T>(method: string, path: string, body?: unknown): Promise<T> {
    return request<T>(this.baseUrl, {
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      path,
      body,
      token: this.token,
      timeout: this.timeout,
    });
  }

  /** @internal Convert HTTP URL to WebSocket URL */
  wsUrl(path: string): string {
    const url = new URL(path, this.baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  }
}
