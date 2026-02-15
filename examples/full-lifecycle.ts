import { NoidClient, NoidAPIError } from '@noid/sdk';

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

    cmd.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(`  [stream] ${chunk.toString()}`);
    });

    const exitCode = await cmd.wait();
    console.log(`  [exit] code: ${exitCode}`);

    // 5. Checkpoint the VM
    console.log('\n--- Checkpoint ---');
    const checkpoint = await vm.createCheckpoint({ label: 'after-demo' });
    console.log(`Checkpoint created: ${checkpoint.id} (label: ${checkpoint.label})`);

    const checkpoints = await vm.listCheckpoints();
    console.log(`Total checkpoints: ${checkpoints.length}`);

    // 6. Interactive console (attach for 5 seconds, then detach)
    console.log('\n--- Console (5 second demo) ---');
    const console_ = vm.console({
      env: { CONSOLE_SESSION: 'true' },
    });
    await console_.start();

    const consoleOutput: string[] = [];
    console_.stdout.on('data', (chunk: Buffer) => {
      consoleOutput.push(chunk.toString());
    });

    console_.stdin.write('echo "Hello from console, CONSOLE_SESSION=$CONSOLE_SESSION"\r');

    await new Promise(resolve => setTimeout(resolve, 5000));
    console_.close();
    console.log(`Console output (${consoleOutput.length} chunks received)`);

    // 7. Restore from checkpoint (as new VM)
    console.log('\n--- Restore ---');
    const restoredName = `${vmName}-restored`;
    const restored = await vm.restore(checkpoint.id, { newName: restoredName });
    console.log(`Restored as: ${restored.name}`);

    const restoreResult = await restored.exec(['echo', 'restored!']);
    console.log('Restored VM exec:', restoreResult.stdout.trim());

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
