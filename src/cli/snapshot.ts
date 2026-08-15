#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureCatalogSnapshot } from '../catalog.js';
import { McpSession } from '../mcp-session.js';

interface CliOptions {
  endpoint: URL;
  output: string;
}

export function parseSnapshotArgs(args: string[]): CliOptions {
  let endpoint: string | undefined;
  let output = 'mcp-catalog.json';
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--endpoint') endpoint = args[++index];
    else if (argument === '--output') output = args[++index] ?? output;
    else if (argument === '--help') {
      console.log('Usage: mcp-devtools-snapshot --endpoint <http-url> [--output mcp-catalog.json]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!endpoint) throw new Error('--endpoint is required.');
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('--endpoint must use http or https.');
  }
  return { endpoint: url, output };
}

export async function runSnapshotCommand(options: CliOptions): Promise<void> {
  const authorization = process.env.MCP_DEVTOOLS_AUTHORIZATION;
  const session = new McpSession(options.endpoint, authorization ? { authorization } : {});
  await session.connect();
  const snapshot = await captureCatalogSnapshot(session);
  await mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await session.client.close();
  console.log(`Captured ${snapshot.tools.length} tools to ${options.output}`);
}

const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runSnapshotCommand(parseSnapshotArgs(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
