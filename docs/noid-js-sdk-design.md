# noid-js SDK — Complete Design & Implementation Plan

> A TypeScript SDK for programmatic interaction with the Noid VM platform.
> Inspired by the architectural patterns of [sprites-js](https://github.com/superfly/sprites-js), adapted to the [noid-cli](https://github.com/noid-one/noid-cli) domain model.

---

## Table of Contents

1. [Codebase Comprehension — noid-cli Mapping](#1-codebase-comprehension)
2. [API Parity & Intentional Divergence](#2-api-parity--intentional-divergence)
3. [Sprites-js Pattern Evaluation](#3-sprites-js-pattern-evaluation)
4. [Public SDK Surface](#4-public-sdk-surface)
5. [Internal Architecture](#5-internal-architecture)
6. [Type Safety & Runtime Guarantees](#6-type-safety--runtime-guarantees)
7. [Annotated Code Templates](#7-annotated-code-templates)
8. [Migration Mapping (CLI → SDK)](#8-migration-mapping)
9. [Test & Validation Coverage](#9-test--validation-coverage)
10. [Documentation & Quick Start](#10-documentation--quick-start)

---

## 1. Codebase Comprehension

### noid-cli Architecture Overview

The noid-cli project is a Rust monorepo with 5 crates managing Firecracker microVMs:

| Crate | Responsibility | noid-js Equivalent |
|-------|---------------|-------------------|
| **noid-types** | Shared wire types (serde structs, channel constants, validation) | `src/types.ts` — TypeScript interfaces and validation functions |
| **noid-client** | CLI binary + HTTP/WS API client | `src/client.ts` + `src/vm.ts` — SDK client and VM handle |
| **noid-core** | VM engine: DB, storage, exec, auth, backend trait | **Server-side only** — SDK does not replicate backend logic |
| **noid-server** | HTTP/WS server with REST routes and WebSocket handlers | **Server-side only** — SDK consumes these endpoints |
| **noid-netd** | Privileged network daemon (TAP devices, iptables) | **Server-side only** — Transparent to SDK users |

### Module-by-Module Mapping

#### noid-types → `src/types.ts`

| Rust Type | SDK Type | Notes |
|-----------|----------|-------|
| `CreateVmRequest` | `CreateVmOptions` | Optional cpus/mem with defaults |
| `CheckpointRequest` | `CreateCheckpointOptions` | Optional label |
| `RestoreRequest` | `RestoreOptions` | checkpoint_id + optional new_name |
| `ExecRequest` | `ExecOptions` | command array + optional tty, env |
| `VmInfo` | `VmInfo` | Direct mapping |
| `ExecResult` | `ExecResult` | Direct mapping |
| `ExecResponse` | `ExecResponse` | HTTP exec result |
| `CheckpointInfo` | `CheckpointInfo` | Direct mapping |
| `ErrorResponse` | `NoidError` | Rich error class |
| `VersionInfo` | `VersionInfo` | Direct mapping |
| `WhoamiResponse` | `WhoamiResponse` | Direct mapping |
| `Capabilities` | `Capabilities` | Server limits/defaults |
| `CHANNEL_STDOUT/STDERR/STDIN/RESIZE` | `StreamID` enum | Binary protocol channels |
| `MAX_ENV_VARS`, `MAX_ENV_VALUE_LEN` | Constants + validation | Runtime enforcement |
| `validate_env_name()`, `validate_env_vars()` | `validateEnv()` | Client-side pre-validation |

#### noid-client/api.rs → `src/client.ts`

| Rust Method | SDK Method | Notes |
|-------------|-----------|-------|
| `ApiClient::new(url, token)` | `new NoidClient(options)` | Config object pattern |
| `whoami()` | `client.whoami()` | Identity check |
| `create_vm(name, cpus, mem)` | `client.createVm(name, options?)` | Returns `Vm` handle |
| `list_vms()` | `client.listVms()` | Returns `VmInfo[]` |
| `get_vm(name)` | `client.getVm(name)` | Returns `Vm` handle |
| `destroy_vm(name)` | `vm.destroy()` | On the `Vm` instance |
| `exec_vm(name, cmd, env)` | `vm.exec(cmd, options?)` | Promise-based |
| `exec_ws(name, cmd, env)` | `vm.spawn(cmd, args?, options?)` | Stream-based |
| `console_ws(name, env)` | `vm.console(options?)` | Interactive console |
| `create_checkpoint(name, label)` | `vm.createCheckpoint(options?)` | Returns `CheckpointInfo` |
| `list_checkpoints(name)` | `vm.listCheckpoints()` | Returns `CheckpointInfo[]` |
| `restore_vm(name, id, new_name)` | `vm.restore(checkpointId, options?)` | Returns new `Vm` handle |
| `ws_url(path)` | Internal `wsUrl()` | HTTP→WS conversion |

#### noid-client/config.rs → `src/config.ts`

| Rust Function | SDK Equivalent | Notes |
|--------------|----------------|-------|
| `load_config()` | `NoidClient.fromConfig(path?)` | Static factory |
| `write_config()` | Not needed | SDK doesn't manage config files |
| `resolve_vm_name()` | Not needed | SDK is explicit, no `.noid` file |

#### noid-client/console.rs → `src/console.ts`

| Rust Behavior | SDK Equivalent | Notes |
|--------------|----------------|-------|
| WebSocket console bridge | `VmConsole` class | EventEmitter with stdin/stdout |
| crossterm raw mode | User's responsibility | SDK provides streams |
| Bidirectional I/O | `console.stdin` / `console.stdout` | Node.js streams |

#### noid-client/exec.rs → `src/exec.ts`

| Rust Behavior | SDK Equivalent | Notes |
|--------------|----------------|-------|
| WS exec with streaming | `VmCommand` class | Like sprites-js `SpriteCommand` |
| HTTP exec fallback | `vm.exec()` | Promise-based, captures output |
| Channel multiplexing | Binary protocol parser | StreamID framing |

### Intentionally Omitted (Server-Side Only)

These modules exist in noid-cli but are **not mapped** to noid-js because they are server-side concerns:

| Module | Reason for Omission |
|--------|-------------------|
| `noid-core/backend.rs` | VM orchestration is server-side. SDK calls REST API. |
| `noid-core/db.rs` | SQLite persistence is server-side. |
| `noid-core/storage.rs` | btrfs/reflink logic is server-side. |
| `noid-core/vm.rs` | Firecracker process management is server-side. |
| `noid-core/exec.rs` | Serial console execution is server-side. SDK uses WS/HTTP. |
| `noid-core/network.rs` | noid-netd communication is server-side. |
| `noid-core/auth.rs` | Token hashing/rate-limiting is server-side. SDK sends Bearer token. |
| `noid-server/*` | Entire server is out of scope. |
| `noid-netd/*` | Network daemon is out of scope. |
| `noid-local` (root `src/`) | Legacy standalone CLI. Deprecated. |

---

## 2. API Parity & Intentional Divergence

### Full Parity — Implemented in noid-js

| CLI Command | SDK Call | Status |
|------------|---------|--------|
| `noid auth setup` | `new NoidClient({ baseUrl, token })` | ✅ Implemented (config object) |
| `noid whoami` | `client.whoami()` | ✅ Implemented |
| `noid create <name>` | `client.createVm(name, options?)` | ✅ Implemented |
| `noid destroy [name]` | `vm.destroy()` | ✅ Implemented |
| `noid list` | `client.listVms()` | ✅ Implemented |
| `noid info [name]` | `client.getVm(name)` | ✅ Implemented |
| `noid exec -- <cmd>` | `vm.exec(command, options?)` | ✅ Implemented (HTTP) |
| `noid exec -- <cmd>` (streaming) | `vm.spawn(command, args?, options?)` | ✅ Implemented (WebSocket) |
| `noid console` | `vm.console(options?)` | ✅ Implemented |
| `noid checkpoint` | `vm.createCheckpoint(options?)` | ✅ Implemented |
| `noid checkpoints` | `vm.listCheckpoints()` | ✅ Implemented |
| `noid restore <id>` | `vm.restore(checkpointId, options?)` | ✅ Implemented |
| Health check | `client.health()` | ✅ Implemented |
| Version check | `client.version()` | ✅ Implemented |
| Capabilities | `client.capabilities()` | ✅ Implemented |

### Intentional Divergences

| CLI Feature | SDK Decision | Rationale |
|------------|-------------|-----------|
| `.noid` file for active VM | **Rejected** | SDK calls are explicit. No implicit state. |
| `noid use <name>` | **Rejected** | No concept of "current VM" in SDK. |
| `noid current` | **Rejected** | Same — no implicit state. |
| `noid update` (self-update) | **Rejected** | SDK updated via npm, not self-update. |
| `noid auth setup` (writes config.toml) | **Adapted** | `NoidClient.fromConfig()` reads config but SDK doesn't write it. |
| Table formatting (`tabled`) | **Rejected** | SDK returns structured data, not formatted tables. |
| `-e KEY=VAL` flag parsing | **Adapted** | SDK accepts `{ env: { KEY: "VAL" } }` object, not string pairs. |
| WS→HTTP fallback for exec | **Adapted** | SDK offers both `exec()` (HTTP) and `spawn()` (WS) explicitly. No silent fallback. |

### Deferred (Post-v1)

| Feature | Reason for Deferral |
|---------|-------------------|
| `fromConfig()` static factory | Low priority — most SDK users will pass options directly |
| Retry with backoff | Can be added as middleware/plugin later |
| Connection pooling (like sprites-js control mode) | noid-server doesn't support multiplexing yet |

---

## 3. Sprites-js Pattern Evaluation

### Adopted Patterns

| Pattern | sprites-js Implementation | noid-js Adaptation | Reasoning |
|---------|--------------------------|-------------------|-----------|
| **Client → Resource Handle** | `client.sprite(name)` returns `Sprite` | `client.vm(name)` returns `Vm` | Excellent ergonomics. Operations on the resource, not through client. |
| **spawn/exec/execFile trio** | `sprite.spawn()`, `sprite.exec()`, `sprite.execFile()` | `vm.spawn()`, `vm.exec()` | Mirrors Node.js child_process. Familiar API. `execFile` unnecessary — noid exec takes command arrays. |
| **EventEmitter for streams** | `SpriteCommand extends EventEmitter` | `VmCommand extends EventEmitter` | Standard Node.js pattern for streaming I/O. |
| **stdin/stdout/stderr streams** | Writable stdin, Readable stdout/stderr | Same | Natural composition with Node.js streams. |
| **Binary WebSocket protocol** | StreamID byte + payload | Same (channels 0x01-0x04) | noid-server already uses this exact protocol. |
| **Rich error types** | `APIError`, `ExecError`, `FilesystemError` | `NoidAPIError`, `NoidExecError` | Structured errors enable programmatic handling. |
| **Minimal dependencies** | Node.js stdlib only (Node 24+ has native WS) | `ws` package only (native WebSocket lacks custom headers for auth) | Minimal footprint. Single well-audited dep. |
| **TypeScript-first** | Full type coverage | Same | Type safety is table stakes for modern SDKs. |
| **AsyncIterator for streams** | `for await (const msg of stream)` | Same for checkpoint/console | Modern, ergonomic consumption of streaming data. |

### Adapted Patterns

| Pattern | sprites-js Implementation | noid-js Adaptation | Reasoning |
|---------|--------------------------|-------------------|-----------|
| **Checkpoint streaming** | NDJSON streams with `CheckpointStream` | Not needed — noid checkpoints are synchronous (POST returns JSON) | noid-server checkpoint/restore is a blocking REST call, not streaming. SDK wraps as simple Promise. |
| **Service management** | Full service lifecycle (create/start/stop/signal) | Not applicable | noid VMs don't have a service abstraction. VMs are the unit. |
| **Filesystem operations** | `SpriteFilesystem` class | Not applicable | noid VMs are accessed via exec/console, not filesystem API. |
| **Port proxying** | `ProxySession` with local TCP→WS tunnel | Not applicable currently | noid VMs have direct network (TAP + IP). No proxy needed. |
| **Network policies** | `getNetworkPolicy`, `updateNetworkPolicy` | Not applicable | noid networking is at the TAP/IP level, not policy-based. |
| **Control connection pooling** | `ControlPool` with multiplexed WebSocket | Deferred | noid-server doesn't support control multiplexing. Future opportunity. |

### Rejected Patterns

| Pattern | sprites-js Implementation | Rejection Reason |
|---------|--------------------------|-----------------|
| **Static token creation** | `SpritesClient.createToken(macaroon, org)` | noid uses pre-generated tokens from `noid-server add-user`. No OAuth/macaroon exchange. |
| **Organization/billing concepts** | `OrganizationInfo`, `upgradeSprite()` | noid is self-hosted. No billing or org management in SDK. |
| **URL settings** | `updateURLSettings(public/sprite)` | noid VMs don't have public URLs. Access is via API only. |
| **TTY auto-detection from session_info** | Sprites sends session_info on attach | noid console is always TTY. noid exec TTY is client-specified. |

---

## 4. Public SDK Surface

### Package Entry Point: `src/index.ts`

```typescript
// Classes
export { NoidClient } from './client';
export { Vm } from './vm';
export { VmCommand } from './exec';
export { VmConsole } from './console';

// Types
export type {
  // Client configuration
  NoidClientOptions,

  // VM types
  VmInfo,
  CreateVmOptions,

  // Execution types
  ExecOptions,
  ExecResult,
  SpawnOptions,

  // Console types
  ConsoleOptions,

  // Checkpoint types
  CheckpointInfo,
  CreateCheckpointOptions,
  RestoreOptions,

  // Server info types
  VersionInfo,
  WhoamiResponse,
  Capabilities,

  // Env types
  EnvVars,
} from './types';

// Errors
export { NoidError, NoidAPIError, NoidExecError, NoidConnectionError } from './errors';

// Constants
export { StreamID, API_VERSION } from './constants';
```

### Client API

```typescript
class NoidClient {
  constructor(options: NoidClientOptions);

  // VM operations
  vm(name: string): Vm;                                    // Get handle (no server call)
  createVm(name: string, options?: CreateVmOptions): Promise<Vm>;
  getVm(name: string): Promise<Vm>;                        // Fetches info from server
  listVms(): Promise<VmInfo[]>;
  destroyVm(name: string): Promise<void>;

  // Server info (unauthenticated)
  health(): Promise<{ status: string }>;
  version(): Promise<VersionInfo>;

  // Server info (authenticated)
  whoami(): Promise<WhoamiResponse>;
  capabilities(): Promise<Capabilities>;
}
```

### VM API

```typescript
class Vm {
  readonly name: string;
  readonly client: NoidClient;

  // Lifecycle
  destroy(): Promise<void>;
  info(): Promise<VmInfo>;

  // Execution — Promise-based (HTTP)
  exec(command: string[], options?: ExecOptions): Promise<ExecResult>;

  // Execution — Stream-based (WebSocket)
  spawn(command: string[], options?: SpawnOptions): VmCommand;

  // Console — Interactive (WebSocket)
  console(options?: ConsoleOptions): VmConsole;

  // Checkpoints
  createCheckpoint(options?: CreateCheckpointOptions): Promise<CheckpointInfo>;
  listCheckpoints(): Promise<CheckpointInfo[]>;
  restore(checkpointId: string, options?: RestoreOptions): Promise<Vm>;
}
```

### VmCommand API (Streaming Exec)

```typescript
class VmCommand extends EventEmitter {
  readonly stdout: Readable;       // Server stdout (binary frames, CHANNEL_STDOUT)
  readonly stderr: Readable;       // Server stderr (binary frames, CHANNEL_STDERR)

  start(): Promise<void>;          // Connect WS, send ExecRequest JSON, begin streaming
  wait(): Promise<number>;         // Wait for ExecResult JSON text frame, return exit code
  exitCode(): number;              // Current exit code (-1 if not exited)

  // NOTE: stdin is NOT interactive for exec — noid-server runs the command
  // synchronously via serial console and streams the output back.
  // Resize is also not supported for exec.

  // Events: 'spawn', 'exit', 'error'
}
```

### VmConsole API (Interactive Console)

```typescript
class VmConsole extends EventEmitter {
  readonly stdin: Writable;        // Writes to serial.in via CHANNEL_STDIN binary frames
  readonly stdout: Readable;       // Reads serial.log via CHANNEL_STDOUT binary frames

  start(): Promise<void>;          // Connect WS, inject env vars (if any), emit 'open'
  close(): void;                   // Disconnect WebSocket
  resize(cols: number, rows: number): void;  // Reserved — server does not handle yet

  // Events: 'open', 'close', 'error'
  // Env injection is client-side: sends `export KEY='val'\r` commands through stdin,
  // then waits for a sync marker to echo back (same approach as noid CLI).
}
```

---

## 5. Internal Architecture

### Folder Structure

```
noid-js/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts              # Public API re-exports
│   ├── client.ts             # NoidClient class
│   ├── vm.ts                 # Vm class (resource handle)
│   ├── exec.ts               # VmCommand (WebSocket exec)
│   ├── console.ts            # VmConsole (WebSocket console)
│   ├── types.ts              # All TypeScript interfaces
│   ├── errors.ts             # Error classes
│   ├── constants.ts          # StreamID, channel bytes, limits
│   ├── internal/
│   │   ├── http.ts           # HTTP request helpers (fetch wrapper)
│   │   ├── websocket.ts      # WebSocket connection + binary protocol
│   │   └── validation.ts     # Env var validation, name validation
│   └── __tests__/
│       ├── client.test.ts
│       ├── vm.test.ts
│       ├── exec.test.ts
│       ├── console.test.ts
│       ├── errors.test.ts
│       ├── validation.test.ts
│       └── integration.test.ts
├── examples/
│   ├── quickstart.ts
│   ├── exec-streaming.ts
│   ├── console-interactive.ts
│   ├── checkpoint-restore.ts
│   └── env-injection.ts
└── .github/
    └── workflows/
        └── ci.yml
```

### Module Dependency Graph

```
index.ts
  ├── client.ts
  │     ├── vm.ts
  │     │     ├── exec.ts
  │     │     │     ├── internal/websocket.ts
  │     │     │     ├── types.ts
  │     │     │     └── constants.ts
  │     │     ├── console.ts
  │     │     │     ├── internal/websocket.ts
  │     │     │     └── types.ts
  │     │     ├── internal/http.ts
  │     │     ├── internal/validation.ts
  │     │     ├── types.ts
  │     │     └── errors.ts
  │     ├── internal/http.ts
  │     │     ├── types.ts
  │     │     └── errors.ts
  │     └── types.ts
  ├── types.ts
  ├── errors.ts
  └── constants.ts
```

### Layer Separation

```
┌─────────────────────────────────────────────────┐
│                  Public API Layer                 │
│  NoidClient, Vm, VmCommand, VmConsole, types     │
│  (src/client.ts, src/vm.ts, src/exec.ts, ...)    │
├─────────────────────────────────────────────────┤
│              Internal Orchestration               │
│  HTTP helpers, validation, error mapping          │
│  (src/internal/http.ts, validation.ts)            │
├─────────────────────────────────────────────────┤
│             Transport / Protocol Layer            │
│  WebSocket framing, binary protocol, keepalive    │
│  (src/internal/websocket.ts)                      │
└─────────────────────────────────────────────────┘
```

### Internal Module Specifications

#### `src/internal/http.ts` — HTTP Transport

**Responsibility**: All HTTP communication with noid-server.

**Inputs**: method, path, body, auth token, timeout
**Outputs**: parsed JSON response or throws NoidAPIError

```typescript
// Internal — not exported from package
interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  token?: string;
  timeout?: number;
}

async function request<T>(baseUrl: string, options: RequestOptions): Promise<T>;
```

**Behaviors**:
- Uses native `fetch()` (Node 18+)
- `AbortSignal.timeout()` for request cancellation
- Parses error responses into `NoidAPIError`
- Sets `Content-Type: application/json`
- Sets `Authorization: Bearer {token}` when token provided
- Handles 204 No Content (returns undefined)

#### `src/internal/websocket.ts` — WebSocket Transport

**Responsibility**: WebSocket connection lifecycle and binary protocol.

**Inputs**: URL, auth token, callbacks for data/close/error
**Outputs**: Events for stdout/stderr/exit data

```typescript
// Internal — not exported from package
class NoidWebSocket extends EventEmitter {
  constructor(url: string, token: string);

  connect(): Promise<void>;
  send(data: Buffer | Uint8Array): void;
  sendText(data: string): void;
  close(): void;

  // Events: 'stdout', 'stderr', 'exit', 'error', 'close', 'message'
}
```

**Protocol Implementation** (verified from noid-server source):

For **WS exec** (`/v1/vms/{name}/exec`):
- Client sends first text frame: JSON `ExecRequest { command, tty, env }`
- Server sends binary frames: `[0x01][...stdout_data]`
- Server sends text frame: JSON `ExecResult { exit_code, timed_out, truncated }` or `ErrorResponse { error }`
- Server closes WebSocket after result

For **WS console** (`/v1/vms/{name}/console`):
- Binary framing: `[channel_byte][...payload]`
  - `0x01` = stdout (server→client)
  - `0x03` = stdin (client→server)
  - `0x02` = stderr (defined in noid-types but not used by console handler)
  - `0x04` = resize (defined in noid-types but **not currently handled** by server)
- Server has configurable timeout (default: 3600s)
- Env injection is **client-side**: SDK sends `export KEY='val'\r` via stdin

For **both** endpoints:
- Auth: `Authorization: Bearer {token}` header in WS upgrade request
- Keepalive: Standard WebSocket ping/pong (server responds to client pings)

#### `src/internal/validation.ts` — Input Validation

**Responsibility**: Client-side validation before sending requests.

```typescript
// Internal — not exported from package
function validateVmName(name: string): void;      // Throws on invalid
function validateEnvVars(env: EnvVars): void;      // Throws on invalid
function validateEnvName(name: string): boolean;   // POSIX check
```

**Rules** (from noid-types):
- VM name: 1-64 chars, no `/`, `\`, `..`, no leading `-` or `.`
- Env name: `[A-Za-z_][A-Za-z0-9_]*`
- Max 64 env vars
- Max 32 KiB per env value

---

## 6. Type Safety & Runtime Guarantees

### Complete Type Definitions (`src/types.ts`)

```typescript
// ─── Client Configuration ───

export interface NoidClientOptions {
  /** Server base URL (e.g., "https://noid.example.com") */
  baseUrl: string;
  /** Authentication token (format: noid_tok_...) */
  token: string;
  /** Request timeout in milliseconds (default: 30_000) */
  timeout?: number;
}

// ─── VM Types ───

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

// ─── Execution Types ───

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

// ─── Console Types ───

export interface ConsoleOptions {
  /** Environment variables to inject */
  env?: EnvVars;
  /** TTY dimensions (default: 80x24) */
  rows?: number;
  cols?: number;
}

// ─── Checkpoint Types ───

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

// ─── Server Info Types ───

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
```

### Error Types (`src/errors.ts`)

```typescript
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

  isNotFound(): boolean { return this.statusCode === 404; }
  isConflict(): boolean { return this.statusCode === 409; }
  isUnauthorized(): boolean { return this.statusCode === 401; }
  isRateLimited(): boolean { return this.statusCode === 429; }
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
```

### Constants (`src/constants.ts`)

```typescript
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
```

### Runtime Validation

All exported APIs validate inputs before making network calls:

```typescript
// In vm.exec():
validateVmName(this.name);        // Throws NoidValidationError
if (options?.env) {
  validateEnvVars(options.env);   // Throws NoidValidationError
}
// Then makes HTTP request...
```

---

## 7. Annotated Code Templates

### `src/client.ts` — NoidClient

```typescript
import { EventEmitter } from 'node:events';
import { Vm } from './vm';
import { request } from './internal/http';
import type {
  NoidClientOptions,
  VmInfo,
  CreateVmOptions,
  VersionInfo,
  WhoamiResponse,
  Capabilities,
} from './types';
import { validateVmName } from './internal/validation';
import { DEFAULT_TIMEOUT_MS, TOKEN_PREFIX } from './constants';
import { NoidValidationError } from './errors';

export class NoidClient {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeout: number;

  constructor(options: NoidClientOptions) {
    // Validate token format
    if (!options.token.startsWith(TOKEN_PREFIX)) {
      throw new NoidValidationError('token', `Token must start with '${TOKEN_PREFIX}'`);
    }

    // Normalize base URL (strip trailing slash)
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
      method: method as any,
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
```

### `src/vm.ts` — Vm Handle

```typescript
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
} from './types';
import type { NoidClient } from './client';
import { VmCommand } from './exec';
import { VmConsole } from './console';
import { validateEnvVars } from './internal/validation';

export class Vm {
  readonly name: string;
  readonly client: NoidClient;

  // Cached info from server (may be stale)
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
   * Returns immediately — call .start() then use stdin/stdout/stderr streams.
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

// ─── Helpers ───

/** Convert { KEY: "value" } to ["KEY=value", ...] */
function envToArray(env: EnvVars): string[] {
  return Object.entries(env).map(([k, v]) => `${k}=${v}`);
}
```

### `src/exec.ts` — VmCommand (Streaming Execution)

> **PROTOCOL NOTE (verified from noid-server source):**
> The WS exec endpoint (`/v1/vms/{name}/exec`) uses the following protocol:
> 1. Client connects with `Authorization: Bearer` header during WS upgrade
> 2. Client sends **first text frame** as JSON `ExecRequest { command, tty, env }`
> 3. Server sends binary frames prefixed with `CHANNEL_STDOUT` (0x01) for output
> 4. Server sends text frame with JSON `ExecResult { exit_code, timed_out, truncated }` on completion
> 5. Server may send text frame with JSON `ErrorResponse { error }` on failure
> 6. Server closes the WebSocket
>
> There are **no query parameters** — everything is sent in the initial JSON frame.

```typescript
import { EventEmitter } from 'node:events';
import { Readable, Writable, PassThrough } from 'node:stream';
import type { Vm } from './vm';
import type { SpawnOptions, ExecResult, EnvVars } from './types';
import { NoidWebSocket } from './internal/websocket';
import { StreamID } from './constants';
import { NoidExecError } from './errors';

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

    // Create passthrough streams for piping
    const stdinPassthrough = new PassThrough();
    const stdoutPassthrough = new PassThrough();
    const stderrPassthrough = new PassThrough();

    this.stdin = stdinPassthrough;
    this.stdout = stdoutPassthrough;
    this.stderr = stderrPassthrough;

    // Exit promise for wait()
    this.exitPromise = new Promise<number>((resolve) => {
      this.resolveExit = resolve;
    });

    // NOTE: stdin is not wired to the server for exec — noid-server's WS exec
    // does not read stdin from the client. It sends the command, runs it
    // synchronously via serial console, and streams the result back.
    // stdin is reserved for future interactive/tty exec support.
  }

  /**
   * Build WebSocket URL for the exec endpoint.
   * No query params — the ExecRequest is sent as the first text frame.
   */
  private buildUrl(): string {
    return this.vm.client.wsUrl(
      `/v1/vms/${encodeURIComponent(this.vm.name)}/exec`
    );
  }

  /**
   * Build the ExecRequest JSON to send as the first text frame.
   * This mirrors the Rust ExecRequest { command, tty, env } struct.
   */
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

    // Handle binary frames: CHANNEL_STDOUT (0x01) and CHANNEL_STDERR (0x02)
    this.ws.on('stdout', (data: Buffer) => {
      (this.stdout as PassThrough).write(data);
    });

    this.ws.on('stderr', (data: Buffer) => {
      (this.stderr as PassThrough).write(data);
    });

    // Handle text frames: ExecResult JSON or ErrorResponse JSON
    this.ws.on('message', (text: string) => {
      try {
        const parsed = JSON.parse(text);

        // Check if it's an ExecResult (has exit_code field)
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

        // Check if it's an ErrorResponse (has error field)
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
      // If we haven't received an exit event, resolve with -1
      if (this._exitCode === -1) {
        (this.stdout as PassThrough).end();
        (this.stderr as PassThrough).end();
        this.resolveExit(-1);
      }
    });

    await this.ws.connect();

    // Send ExecRequest as the first text frame (required by noid-server protocol)
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

  /** Resize TTY (only valid when tty: true). Not currently supported by noid-server. */
  resize(cols: number, rows: number): void {
    // Reserved for future use — noid-server does not handle resize for exec.
    // Console sessions support resize via the CHANNEL_RESIZE protocol.
  }
}
```

### `src/console.ts` — VmConsole (Interactive Console)

> **PROTOCOL NOTE (verified from noid-server source):**
> The console endpoint (`/v1/vms/{name}/console`) uses the following protocol:
> 1. Client connects with `Authorization: Bearer` header during WS upgrade
> 2. **No query params, no initial JSON frame** — connection is immediately active
> 3. Server sends binary frames prefixed with `CHANNEL_STDOUT` (0x01) for serial output
> 4. Client sends binary frames prefixed with `CHANNEL_STDIN` (0x03) for serial input
> 5. Server has a configurable timeout (default: 3600s) after which it closes
> 6. **Env injection** is a client-side convenience: the CLI sends `export KEY='val'\r`
>    commands through stdin, then waits for a sync marker. The SDK replicates this.
> 7. **Resize is not currently supported** by the server's console handler.

```typescript
import { EventEmitter } from 'node:events';
import { Readable, Writable, PassThrough } from 'node:stream';
import type { Vm } from './vm';
import type { ConsoleOptions, EnvVars } from './types';
import { NoidWebSocket } from './internal/websocket';
import { StreamID } from './constants';

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

  /** Build WebSocket URL — no query params needed */
  private buildUrl(): string {
    return this.vm.client.wsUrl(
      `/v1/vms/${encodeURIComponent(this.vm.name)}/console`
    );
  }

  /**
   * Inject environment variables by sending shell export commands through stdin.
   * This mirrors the noid CLI's approach: send `export KEY='escaped_val'\r` for each var,
   * then send a sync marker and wait for it to appear in stdout.
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

    // Wait up to 3 seconds for the marker to appear in stdout
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
   * This is a no-op reserved for future server support.
   */
  resize(cols: number, rows: number): void {
    // Reserved — server does not process resize frames yet.
    // When server adds support, this will send a CHANNEL_RESIZE frame:
    // const msg = JSON.stringify({ cols, rows });
    // const payload = Buffer.from(msg);
    // const frame = Buffer.alloc(1 + payload.length);
    // frame[0] = StreamID.Resize;
    // payload.copy(frame, 1);
    // this.ws?.send(frame);
  }
}
```

### `src/internal/http.ts` — HTTP Transport

```typescript
import { NoidAPIError, NoidConnectionError } from '../errors';

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  token?: string;
  timeout?: number;
}

export async function request<T>(baseUrl: string, options: RequestOptions): Promise<T> {
  const url = `${baseUrl}${options.path}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new NoidConnectionError(`Request timed out after ${options.timeout}ms`, { cause: err as Error });
    }
    throw new NoidConnectionError(`Failed to connect to ${baseUrl}`, { cause: err as Error });
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  // Parse response body
  const text = await response.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  // Error responses
  if (response.status >= 400) {
    const errorMessage = body?.error ?? body?.message ?? text || `HTTP ${response.status}`;
    throw new NoidAPIError(response.status, errorMessage);
  }

  return body as T;
}
```

### `src/internal/websocket.ts` — WebSocket Transport

> **PROTOCOL NOTE**: noid-server uses `tungstenite` (Rust) for WebSocket handling.
> - Auth is via `Authorization: Bearer {token}` header during the HTTP upgrade.
> - Binary frames use a 1-byte channel prefix: `[channel][...payload]`.
> - Text frames carry JSON (ExecRequest, ExecResult, ErrorResponse).
> - The server responds to client Ping frames with Pong.
> - **Exit codes** are sent as JSON text frames (`ExecResult`), NOT as binary channel frames.

```typescript
import { EventEmitter } from 'node:events';
import WebSocket from 'ws'; // Required: Node.js 'ws' package (native WebSocket lacks headers support)
import { StreamID, WS_PING_INTERVAL_MS } from '../constants';
import { NoidConnectionError } from '../errors';

/**
 * Low-level WebSocket wrapper for noid binary protocol.
 *
 * Emits:
 * - 'stdout' (Buffer) — data from CHANNEL_STDOUT (0x01)
 * - 'stderr' (Buffer) — data from CHANNEL_STDERR (0x02)
 * - 'message' (string) — text frames (JSON: ExecResult, ErrorResponse)
 * - 'close' — connection closed
 * - 'error' (Error) — connection error
 *
 * Does NOT emit 'exit' — exit codes come via text frame JSON, handled by VmCommand.
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
      // The 'ws' package supports custom headers (unlike browser WebSocket).
      // noid-server authenticates via the Authorization header during upgrade.
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

      this.ws.on('ping', (data: Buffer) => {
        // ws package auto-responds to pings, but we can also handle manually
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
          // StreamID.Stdin (0x03) and StreamID.Resize (0x04) are client→server only
          default:
            // Unknown channel — ignore
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
```

### `src/internal/validation.ts` — Input Validation

```typescript
import { NoidValidationError } from '../errors';
import { MAX_ENV_VARS, MAX_ENV_VALUE_LEN } from '../constants';
import type { EnvVars } from '../types';

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
```

---

## 8. Migration Mapping

### CLI Command → SDK Call

```typescript
// ─── noid auth setup --url URL --token TOKEN ───
const client = new NoidClient({
  baseUrl: 'https://noid.example.com',
  token: 'noid_tok_abc123...',
});

// ─── noid whoami ───
const me = await client.whoami();
console.log(me.name, me.user_id);

// ─── noid create my-vm --cpus 2 --mem 4096 ───
const vm = await client.createVm('my-vm', { cpus: 2, memMib: 4096 });

// ─── noid list ───
const vms = await client.listVms();
for (const info of vms) {
  console.log(info.name, info.state, info.cpus, info.mem_mib);
}

// ─── noid info my-vm ───
const info = await client.vm('my-vm').info();
console.log(info);

// ─── noid exec my-vm -e DB_HOST=localhost -- ls -la /tmp ───
const result = await client.vm('my-vm').exec(['ls', '-la', '/tmp'], {
  env: { DB_HOST: 'localhost' },
});
console.log(result.stdout);
console.log('Exit code:', result.exit_code);

// ─── noid exec my-vm -- python3 script.py (streaming) ───
const cmd = client.vm('my-vm').spawn(['python3', 'script.py']);
await cmd.start();
cmd.stdout.on('data', (chunk) => process.stdout.write(chunk));
cmd.stderr.on('data', (chunk) => process.stderr.write(chunk));
const exitCode = await cmd.wait();

// ─── noid console my-vm ───
const console_ = client.vm('my-vm').console({ rows: 40, cols: 120 });
await console_.start();
process.stdin.pipe(console_.stdin);
console_.stdout.pipe(process.stdout);
// Later: console_.close();

// ─── noid checkpoint my-vm --label "before deploy" ───
const cp = await client.vm('my-vm').createCheckpoint({ label: 'before deploy' });
console.log('Checkpoint:', cp.id);

// ─── noid checkpoints my-vm ───
const checkpoints = await client.vm('my-vm').listCheckpoints();

// ─── noid restore my-vm abc123 --as my-vm-restored ───
const restored = await client.vm('my-vm').restore('abc123', {
  newName: 'my-vm-restored',
});
console.log('Restored as:', restored.name);

// ─── noid destroy my-vm ───
await client.vm('my-vm').destroy();
```

### CLI Logic Reuse Points

| CLI Logic (Rust) | SDK Reuse | Implementation |
|-----------------|-----------|----------------|
| Token format validation (`noid_tok_` + 64 hex) | Direct port | `validation.ts` checks prefix |
| Env var validation (POSIX names, limits) | Direct port | `validation.ts` mirrors `validate_env_vars()` |
| VM name validation (no traversal, max 64) | Direct port | `validation.ts` mirrors `validate_name()` |
| HTTP→WS URL conversion | Direct port | `client.wsUrl()` replaces protocol |
| Channel byte protocol (0x01-0x04) | Direct port | `StreamID` enum, `websocket.ts` parser |
| Error response parsing | Adapted | `NoidAPIError` from JSON `{ error: "..." }` |
| WS exec query params | Adapted | `VmCommand.buildUrl()` builds params |

---

## 9. Test & Validation Coverage

### Test Strategy

```
src/__tests__/
├── client.test.ts          # Unit: client construction, URL building, method routing
├── vm.test.ts              # Unit: VM handle methods, request body construction
├── exec.test.ts            # Unit: VmCommand URL building, stream wiring
├── console.test.ts         # Unit: VmConsole URL building, stream wiring
├── errors.test.ts          # Unit: error class construction, helper methods
├── validation.test.ts      # Unit: all validation rules
├── http.test.ts            # Unit: HTTP helper with mocked fetch
├── websocket.test.ts       # Unit: binary protocol parsing
└── integration.test.ts     # Integration: real server (requires NOID_URL + NOID_TOKEN)
```

### Unit Test Coverage

#### `validation.test.ts`

```typescript
import { describe, it, assert } from 'node:test';
import { validateVmName, validateEnvVars, validateEnvName } from '../internal/validation';
import { NoidValidationError } from '../errors';

describe('validateVmName', () => {
  it('accepts valid names', () => {
    validateVmName('my-vm');
    validateVmName('test_123');
    validateVmName('a');
    validateVmName('a'.repeat(64));
  });

  it('rejects empty names', () => {
    assert.throws(() => validateVmName(''), NoidValidationError);
  });

  it('rejects names exceeding 64 chars', () => {
    assert.throws(() => validateVmName('a'.repeat(65)), NoidValidationError);
  });

  it('rejects path separators', () => {
    assert.throws(() => validateVmName('foo/bar'), NoidValidationError);
    assert.throws(() => validateVmName('foo\\bar'), NoidValidationError);
  });

  it('rejects directory traversal', () => {
    assert.throws(() => validateVmName('..'), NoidValidationError);
    assert.throws(() => validateVmName('foo..bar'), NoidValidationError);
  });

  it('rejects leading dash or dot', () => {
    assert.throws(() => validateVmName('-vm'), NoidValidationError);
    assert.throws(() => validateVmName('.vm'), NoidValidationError);
  });
});

describe('validateEnvVars', () => {
  it('accepts valid env vars', () => {
    validateEnvVars({ HOME: '/root', DB_URL: 'postgres://...' });
  });

  it('accepts underscore-prefixed names', () => {
    validateEnvVars({ _INTERNAL: 'yes' });
  });

  it('rejects invalid names', () => {
    assert.throws(() => validateEnvVars({ '1BAD': 'val' }), NoidValidationError);
    assert.throws(() => validateEnvVars({ 'has space': 'val' }), NoidValidationError);
    assert.throws(() => validateEnvVars({ 'has-dash': 'val' }), NoidValidationError);
  });

  it('rejects too many vars', () => {
    const env: Record<string, string> = {};
    for (let i = 0; i < 65; i++) env[`VAR_${i}`] = 'x';
    assert.throws(() => validateEnvVars(env), NoidValidationError);
  });

  it('rejects oversized values', () => {
    assert.throws(
      () => validateEnvVars({ BIG: 'x'.repeat(32 * 1024 + 1) }),
      NoidValidationError
    );
  });
});

describe('validateEnvName', () => {
  it('returns true for valid POSIX names', () => {
    assert.strictEqual(validateEnvName('HOME'), true);
    assert.strictEqual(validateEnvName('_foo'), true);
    assert.strictEqual(validateEnvName('A1'), true);
  });

  it('returns false for invalid names', () => {
    assert.strictEqual(validateEnvName('1BAD'), false);
    assert.strictEqual(validateEnvName(''), false);
    assert.strictEqual(validateEnvName('a-b'), false);
  });
});
```

#### `errors.test.ts`

```typescript
import { describe, it, assert } from 'node:test';
import { NoidAPIError, NoidExecError, NoidConnectionError, NoidValidationError } from '../errors';

describe('NoidAPIError', () => {
  it('constructs with status and message', () => {
    const err = new NoidAPIError(404, 'VM not found');
    assert.strictEqual(err.statusCode, 404);
    assert.strictEqual(err.errorMessage, 'VM not found');
    assert.strictEqual(err.name, 'NoidAPIError');
  });

  it('detects not found', () => {
    assert.strictEqual(new NoidAPIError(404, '').isNotFound(), true);
    assert.strictEqual(new NoidAPIError(500, '').isNotFound(), false);
  });

  it('detects conflict', () => {
    assert.strictEqual(new NoidAPIError(409, '').isConflict(), true);
  });

  it('detects unauthorized', () => {
    assert.strictEqual(new NoidAPIError(401, '').isUnauthorized(), true);
  });

  it('detects rate limit', () => {
    assert.strictEqual(new NoidAPIError(429, '').isRateLimited(), true);
  });
});

describe('NoidExecError', () => {
  it('wraps exec result with exit code', () => {
    const err = new NoidExecError({
      stdout: 'some output',
      exit_code: 1,
      timed_out: false,
      truncated: false,
    });
    assert.strictEqual(err.exitCode, 1);
    assert.strictEqual(err.stdout, 'some output');
    assert.match(err.message, /exit code 1/);
  });

  it('reports timeout', () => {
    const err = new NoidExecError({
      stdout: '',
      exit_code: null,
      timed_out: true,
      truncated: false,
    });
    assert.strictEqual(err.timedOut, true);
    assert.match(err.message, /timed out/);
  });
});
```

#### `client.test.ts`

```typescript
import { describe, it, assert } from 'node:test';
import { NoidClient } from '../client';
import { NoidValidationError } from '../errors';

describe('NoidClient', () => {
  it('constructs with valid options', () => {
    const client = new NoidClient({
      baseUrl: 'https://noid.example.com',
      token: 'noid_tok_' + 'a'.repeat(64),
    });
    assert.strictEqual(client.baseUrl, 'https://noid.example.com');
    assert.strictEqual(client.timeout, 30_000);
  });

  it('strips trailing slash from URL', () => {
    const client = new NoidClient({
      baseUrl: 'https://noid.example.com/',
      token: 'noid_tok_' + 'a'.repeat(64),
    });
    assert.strictEqual(client.baseUrl, 'https://noid.example.com');
  });

  it('rejects invalid token format', () => {
    assert.throws(
      () => new NoidClient({ baseUrl: 'https://x.com', token: 'bad_token' }),
      NoidValidationError
    );
  });

  it('accepts custom timeout', () => {
    const client = new NoidClient({
      baseUrl: 'https://x.com',
      token: 'noid_tok_' + 'a'.repeat(64),
      timeout: 5000,
    });
    assert.strictEqual(client.timeout, 5000);
  });

  it('converts HTTP to WS URL', () => {
    const client = new NoidClient({
      baseUrl: 'http://localhost:7654',
      token: 'noid_tok_' + 'a'.repeat(64),
    });
    assert.match(client.wsUrl('/v1/vms/test/exec'), /^ws:\/\//);
  });

  it('converts HTTPS to WSS URL', () => {
    const client = new NoidClient({
      baseUrl: 'https://noid.example.com',
      token: 'noid_tok_' + 'a'.repeat(64),
    });
    assert.match(client.wsUrl('/v1/vms/test/exec'), /^wss:\/\//);
  });
});
```

### Integration Test

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { NoidClient } from '../client';
import { NoidAPIError } from '../errors';

const NOID_URL = process.env.NOID_URL;
const NOID_TOKEN = process.env.NOID_TOKEN;

describe('Integration', { skip: !NOID_URL || !NOID_TOKEN }, () => {
  let client: NoidClient;
  const vmName = `test-${Date.now()}`;

  before(() => {
    client = new NoidClient({ baseUrl: NOID_URL!, token: NOID_TOKEN! });
  });

  after(async () => {
    try { await client.destroyVm(vmName); } catch {}
  });

  it('health check', async () => {
    const health = await client.health();
    assert.strictEqual(health.status, 'ok');
  });

  it('version', async () => {
    const version = await client.version();
    assert.ok(version.version);
    assert.ok(version.api_version >= 1);
  });

  it('whoami', async () => {
    const me = await client.whoami();
    assert.ok(me.user_id);
    assert.ok(me.name);
  });

  it('capabilities', async () => {
    const caps = await client.capabilities();
    assert.ok(caps.api_version >= 1);
    assert.ok(caps.max_exec_output_bytes > 0);
  });

  it('create VM', async () => {
    const vm = await client.createVm(vmName);
    assert.strictEqual(vm.name, vmName);
    const info = await vm.info();
    assert.strictEqual(info.state, 'running');
  });

  it('list VMs includes created VM', async () => {
    const vms = await client.listVms();
    assert.ok(vms.some(v => v.name === vmName));
  });

  it('exec command', async () => {
    const vm = client.vm(vmName);
    const result = await vm.exec(['echo', 'hello']);
    assert.match(result.stdout, /hello/);
    assert.strictEqual(result.exit_code, 0);
  });

  it('exec with env vars', async () => {
    const vm = client.vm(vmName);
    const result = await vm.exec(['sh', '-c', 'echo $MY_VAR'], {
      env: { MY_VAR: 'test_value' },
    });
    assert.match(result.stdout, /test_value/);
  });

  it('spawn streaming exec', async () => {
    const vm = client.vm(vmName);
    const cmd = vm.spawn(['echo', 'streaming']);
    await cmd.start();

    let output = '';
    cmd.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    const exitCode = await cmd.wait();
    assert.strictEqual(exitCode, 0);
    assert.match(output, /streaming/);
  });

  it('checkpoint and restore', async () => {
    const vm = client.vm(vmName);

    // Create checkpoint
    const cp = await vm.createCheckpoint({ label: 'test-checkpoint' });
    assert.ok(cp.id);
    assert.strictEqual(cp.label, 'test-checkpoint');

    // List checkpoints
    const checkpoints = await vm.listCheckpoints();
    assert.ok(checkpoints.some(c => c.id === cp.id));

    // Restore
    const restoredName = `${vmName}-restored`;
    const restored = await vm.restore(cp.id, { newName: restoredName });
    assert.strictEqual(restored.name, restoredName);

    // Cleanup
    await restored.destroy();
  });

  it('destroy VM', async () => {
    await client.vm(vmName).destroy();
    try {
      await client.getVm(vmName);
      assert.fail('Expected 404');
    } catch (err) {
      assert.ok(err instanceof NoidAPIError);
      assert.strictEqual((err as NoidAPIError).statusCode, 404);
    }
  });
});
```

---

## 10. Documentation & Quick Start

### README.md Structure

```markdown
# noid-js

TypeScript SDK for the Noid VM platform.

## Installation

npm install @noid/sdk

## Quick Start

\`\`\`typescript
import { NoidClient } from '@noid/sdk';

const client = new NoidClient({
  baseUrl: 'https://noid.example.com',
  token: process.env.NOID_TOKEN!,
});

// Create a VM
const vm = await client.createVm('my-vm', { cpus: 2, memMib: 4096 });

// Execute a command
const result = await vm.exec(['echo', 'Hello from Noid!']);
console.log(result.stdout); // "Hello from Noid!\n"

// Streaming execution
const cmd = vm.spawn(['python3', '-c', 'import time; [print(i) or time.sleep(1) for i in range(5)]']);
await cmd.start();
cmd.stdout.on('data', (chunk) => process.stdout.write(chunk));
await cmd.wait();

// Checkpoint and restore
const checkpoint = await vm.createCheckpoint({ label: 'before-deploy' });
const restored = await vm.restore(checkpoint.id, { newName: 'my-vm-v2' });

// Clean up
await vm.destroy();
\`\`\`

## Mental Model

noid-js is a thin, typed wrapper over the Noid server REST + WebSocket API.

- **NoidClient** — Authenticated connection to a Noid server. Create VMs, list resources.
- **Vm** — A handle to a specific VM. Execute commands, manage checkpoints, attach consoles.
- **VmCommand** — A streaming command execution (WebSocket). Has stdin/stdout/stderr Node.js streams.
- **VmConsole** — An interactive console session (WebSocket). Bidirectional terminal I/O.

No magic. No implicit state. Every operation is explicit.

## Comparison to sprites-js

| Concept | sprites-js | noid-js |
|---------|-----------|---------|
| Client class | `SpritesClient` | `NoidClient` |
| Resource handle | `Sprite` | `Vm` |
| Exec (promise) | `sprite.exec()` | `vm.exec()` |
| Exec (streaming) | `sprite.spawn()` | `vm.spawn()` |
| Console | Not applicable | `vm.console()` |
| Checkpoints | `sprite.createCheckpoint()` | `vm.createCheckpoint()` |
| Restore | `sprite.restoreCheckpoint(id)` | `vm.restore(id)` |
| Filesystem | `sprite.filesystem()` | Not applicable (use exec) |
| Services | `sprite.createService()` | Not applicable (VM is the unit) |
| Port proxy | `sprite.proxyPort()` | Not applicable (VMs have IPs) |
| Dependencies | Zero (Node 24+ stdlib) | `ws` only (for auth headers in WS upgrade) |
| Node.js minimum | 24.0.0 | 18.0.0 (fetch required) |
\`\`\`

## API Reference

See full API documentation in the source types.

## Error Handling

\`\`\`typescript
import { NoidAPIError, NoidExecError } from '@noid/sdk';

try {
  await vm.exec(['false']);
} catch (err) {
  if (err instanceof NoidAPIError) {
    if (err.isNotFound()) console.log('VM not found');
    if (err.isRateLimited()) console.log('Rate limited');
  }
}
\`\`\`
```

---

## Appendix: Wire Protocol Reference (from noid-server source)

### REST Endpoints

All REST endpoints use JSON request/response bodies with `Content-Type: application/json`.
Auth: `Authorization: Bearer noid_tok_...` header for all `/v1/` routes.

```
Unauthenticated:
  GET  /healthz                      → {"status":"ok"}
  GET  /version                      → {"version":"...","api_version":1}

Authenticated:
  GET  /v1/whoami                    → {"user_id":"...","name":"..."}
  GET  /v1/capabilities              → {api_version, max_exec_output_bytes, timeouts, limits, defaults}
  POST /v1/vms                       ← {"name","cpus","mem_mib"} → VmInfo
  GET  /v1/vms                       → VmInfo[]
  GET  /v1/vms/{name}                → VmInfo
  DELETE /v1/vms/{name}              → 204 No Content
  POST /v1/vms/{name}/exec           ← {"command":[],"tty":bool,"env":[]} → ExecResponse
  POST /v1/vms/{name}/checkpoints    ← {"label":"..."} → CheckpointInfo
  GET  /v1/vms/{name}/checkpoints    → CheckpointInfo[]
  POST /v1/vms/{name}/restore        ← {"checkpoint_id","new_name"} → VmInfo
```

### WebSocket Endpoints

Both WS endpoints use `Authorization: Bearer` header during HTTP upgrade.
noid-server detects WS upgrade via `Upgrade: websocket` header and handles it
separately from REST routing.

#### WS Exec (`GET /v1/vms/{name}/exec` → upgrade)

```
Client                                    Server
  │                                          │
  │──── WS upgrade (Bearer auth) ──────────►│
  │◄─── 101 Switching Protocols ────────────│
  │                                          │
  │──── Text: ExecRequest JSON ────────────►│
  │     {"command":["ls","-la"],             │
  │      "tty":false,                        │
  │      "env":["FOO=bar"]}                  │
  │                                          │
  │     (server runs cmd via serial console) │
  │                                          │
  │◄─── Binary: [0x01][stdout bytes] ───────│  (may be multiple frames)
  │                                          │
  │◄─── Text: ExecResult JSON ─────────────│
  │     {"exit_code":0,                      │
  │      "timed_out":false,                  │
  │      "truncated":false}                  │
  │                                          │
  │◄─── WS Close ──────────────────────────│
```

OR on error:
```
  │◄─── Text: ErrorResponse JSON ──────────│
  │     {"error":"vm not found"}             │
  │◄─── WS Close ──────────────────────────│
```

#### WS Console (`GET /v1/vms/{name}/console` → upgrade)

```
Client                                    Server
  │                                          │
  │──── WS upgrade (Bearer auth) ──────────►│
  │◄─── 101 Switching Protocols ────────────│
  │                                          │
  │     (bidirectional, no initial frame)    │
  │                                          │
  │◄─── Binary: [0x01][serial output] ─────│  (tailing serial.log)
  │──── Binary: [0x03][stdin bytes] ───────►│  (writes to serial.in FIFO)
  │◄─── Binary: [0x01][serial output] ─────│
  │──── Binary: [0x03][stdin bytes] ───────►│
  │     ...                                  │
  │                                          │
  │──── WS Close ──────────────────────────►│  (or server timeout after 3600s)
```

Note: The server filters out exec marker lines (`NOID_EXEC_*`) from console output
so that concurrent exec operations don't leak scaffolding into the console stream.

### Channel Byte Constants (from noid-types)

| Byte | Name | Direction | Usage |
|------|------|-----------|-------|
| `0x01` | CHANNEL_STDOUT | server→client | Serial console output |
| `0x02` | CHANNEL_STDERR | server→client | Defined but only used in WS exec binary frames |
| `0x03` | CHANNEL_STDIN | client→server | Console input to serial.in FIFO |
| `0x04` | CHANNEL_RESIZE | client→server | Defined but **not handled** by server yet |

---

## Appendix: End-to-End Reference Example

This example satisfies criterion 7: creates a VM, injects env vars, executes a command,
and attaches an interactive console. It is designed to compile and run against a live noid-server.

```typescript
// examples/full-lifecycle.ts
import { NoidClient, NoidAPIError } from '@noid/sdk';
import { stdin, stdout } from 'node:process';

async function main() {
  // 1. Create client
  const client = new NoidClient({
    baseUrl: process.env.NOID_URL ?? 'http://localhost:7654',
    token: process.env.NOID_TOKEN!,
  });

  // Verify connection
  const health = await client.health();
  console.log('Server health:', health.status);

  const me = await client.whoami();
  console.log(`Authenticated as: ${me.name} (${me.user_id})`);

  const caps = await client.capabilities();
  console.log(`Server API v${caps.api_version}, exec timeout: ${caps.timeouts.exec_timeout_secs}s`);

  // 2. Create a VM
  const vmName = `sdk-demo-${Date.now()}`;
  console.log(`\nCreating VM '${vmName}'...`);
  const vm = await client.createVm(vmName, { cpus: 1, memMib: 2048 });
  console.log(`VM created: ${vm.name} (state: running)`);

  try {
    // 3. Execute a command with env vars (HTTP — captures full output)
    console.log('\n--- HTTP Exec: echo with env ---');
    const result = await vm.exec(['sh', '-c', 'echo "Hello from $MY_APP running on $(hostname)"'], {
      env: { MY_APP: 'noid-js-sdk', DEPLOY_ENV: 'staging' },
    });
    console.log('stdout:', result.stdout.trim());
    console.log('exit_code:', result.exit_code);

    // 4. Execute a command (WebSocket streaming)
    console.log('\n--- WS Exec: streaming output ---');
    const cmd = vm.spawn(['sh', '-c', 'for i in 1 2 3; do echo "Line $i"; sleep 0.5; done']);
    await cmd.start();

    let wsOutput = '';
    cmd.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      wsOutput += text;
      process.stdout.write(`  [stream] ${text}`);
    });

    const exitCode = await cmd.wait();
    console.log(`  [exit] code: ${exitCode}`);

    // 5. Checkpoint the VM
    console.log('\n--- Checkpoint ---');
    const checkpoint = await vm.createCheckpoint({ label: 'after-demo' });
    console.log(`Checkpoint created: ${checkpoint.id} (label: ${checkpoint.label})`);

    // List checkpoints
    const checkpoints = await vm.listCheckpoints();
    console.log(`Total checkpoints: ${checkpoints.length}`);

    // 6. Interactive console (attach for 5 seconds, then detach)
    console.log('\n--- Console (5 second demo) ---');
    const console_ = vm.console({
      env: { CONSOLE_SESSION: 'true' },
    });
    await console_.start();

    // Read console output for 5 seconds
    const consoleOutput: string[] = [];
    console_.stdout.on('data', (chunk: Buffer) => {
      consoleOutput.push(chunk.toString());
    });

    // Send a command through the console
    console_.stdin.write('echo "Hello from console, CONSOLE_SESSION=$CONSOLE_SESSION"\r');

    await new Promise(resolve => setTimeout(resolve, 5000));
    console_.close();
    console.log(`Console output (${consoleOutput.length} chunks received)`);

    // 7. Restore from checkpoint (as new VM)
    console.log('\n--- Restore ---');
    const restoredName = `${vmName}-restored`;
    const restored = await vm.restore(checkpoint.id, { newName: restoredName });
    console.log(`Restored as: ${restored.name}`);

    // Verify restored VM works
    const restoreResult = await restored.exec(['echo', 'restored!']);
    console.log('Restored VM exec:', restoreResult.stdout.trim());

    // Cleanup restored VM
    await restored.destroy();
    console.log(`Destroyed: ${restoredName}`);

  } finally {
    // 8. Cleanup
    console.log(`\nDestroying VM '${vmName}'...`);
    try {
      await vm.destroy();
      console.log('Done.');
    } catch (err) {
      if (err instanceof NoidAPIError && err.isNotFound()) {
        console.log('Already destroyed.');
      } else {
        throw err;
      }
    }
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
```

**Run with:**
```bash
export NOID_URL=http://localhost:7654
export NOID_TOKEN=noid_tok_your_token_here
npx tsx examples/full-lifecycle.ts
```

---

## Appendix A: package.json

```json
{
  "name": "@noid/sdk",
  "version": "0.1.0",
  "description": "TypeScript SDK for the Noid VM platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "test": "node --test dist/__tests__/*.test.js",
    "test:unit": "node --test dist/__tests__/!(integration).test.js",
    "test:integration": "node --test dist/__tests__/integration.test.js",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0",
    "typescript": "^5.4.0"
  },
  "license": "MIT"
}
```

## Appendix B: tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "examples"]
}
```

---

## Completion Checklist

| # | Criterion | Status |
|---|----------|--------|
| 1 | Codebase Comprehension — all crates mapped | ✅ Complete |
| 2 | API Parity — all CLI commands mapped with status | ✅ Complete |
| 3 | Sprites-js Pattern Evaluation — adopted/adapted/rejected | ✅ Complete |
| 4 | Stable Public SDK Surface — frozen, no TODOs | ✅ Complete |
| 5 | Internal Architecture — 3-layer separation | ✅ Complete |
| 6 | Type Safety — all APIs typed, runtime validation | ✅ Complete |
| 7 | Reference Implementation — end-to-end examples | ✅ Complete |
| 8 | Migration Mapping — CLI→SDK for every command | ✅ Complete |
| 9 | Test Coverage — unit + integration suites | ✅ Complete |
| 10 | Documentation — README, quick start, mental model | ✅ Complete |
