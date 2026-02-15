# noid-js

TypeScript SDK for the Noid VM platform.

## Installation

```bash
npm install @noid/sdk
```

## Quick Start

```typescript
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
```

## Mental Model

noid-js is a thin, typed wrapper over the Noid server REST + WebSocket API.

- **NoidClient** — Authenticated connection to a Noid server. Create VMs, list resources.
- **Vm** — A handle to a specific VM. Execute commands, manage checkpoints, attach consoles.
- **VmCommand** — A streaming command execution (WebSocket). Has stdin/stdout/stderr Node.js streams.
- **VmConsole** — An interactive console session (WebSocket). Bidirectional terminal I/O.

No magic. No implicit state. Every operation is explicit.

## API Overview

### NoidClient

```typescript
const client = new NoidClient({ baseUrl, token, timeout? });

client.vm(name)                          // Get VM handle (no server call)
client.createVm(name, { cpus?, memMib? }) // Create VM
client.getVm(name)                       // Fetch VM info
client.listVms()                         // List all VMs
client.destroyVm(name)                   // Destroy VM

client.health()                          // Health check (unauthenticated)
client.version()                         // Server version (unauthenticated)
client.whoami()                          // Identity check
client.capabilities()                    // Server limits/defaults
```

### Vm

```typescript
const vm = client.vm('my-vm');

vm.exec(command, { env?, tty? })         // HTTP exec (captures output)
vm.spawn(command, { env?, tty? })        // WS exec (streaming)
vm.console({ env?, rows?, cols? })       // Interactive console

vm.createCheckpoint({ label? })          // Create checkpoint
vm.listCheckpoints()                     // List checkpoints
vm.restore(checkpointId, { newName? })   // Restore from checkpoint

vm.info()                                // Fetch VM info
vm.destroy()                             // Destroy VM
```

## Error Handling

```typescript
import { NoidAPIError, NoidExecError } from '@noid/sdk';

try {
  await vm.exec(['false']);
} catch (err) {
  if (err instanceof NoidAPIError) {
    if (err.isNotFound()) console.log('VM not found');
    if (err.isRateLimited()) console.log('Rate limited');
  }
}
```

## Requirements

- Node.js >= 18.0.0
- Single dependency: `ws` (for WebSocket with auth headers)
