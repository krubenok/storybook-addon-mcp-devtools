import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createBrokerHandlers } from './broker.js';
import { validateAddonOptions } from './config.js';
import type { AddonOptions } from './types.js';

interface StorybookServerApp {
  get(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
  post(
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  ): void;
}

export function managerEntries(entries: string[] = []): string[] {
  return [...entries, path.join(import.meta.dirname, 'manager.js')];
}

export function previewAnnotations(entries: string[] = []): string[] {
  return [...entries, path.join(import.meta.dirname, 'preview.js')];
}

export function managerHead(head = '', rawOptions: AddonOptions = {}): string {
  const options = validateAddonOptions(rawOptions);
  const publicOptions = {
    brokerPath: options.brokerPath,
    snapshotUrl: options.snapshotUrl,
    ...(options.sandboxUrl ? { sandboxUrl: options.sandboxUrl.href } : {}),
  };
  return `${head}<script>window.__MCP_DEVTOOLS_CONFIG__=${JSON.stringify(publicOptions).replaceAll('<', '\\u003c')};</script>`;
}

export async function experimental_devServer(
  app: StorybookServerApp | undefined,
  rawOptions: AddonOptions = {},
): Promise<StorybookServerApp | undefined> {
  if (!app) return app;
  const options = validateAddonOptions(rawOptions);
  const handlers = createBrokerHandlers(options);
  app.get(`${options.brokerPath}/status`, (req, res) => handlers.status(req, res));
  app.get(`${options.brokerPath}/catalog.json`, (req, res) => void handlers.catalog(req, res));
  app.post(`${options.brokerPath}/protocol`, (req, res) => void handlers.protocol(req, res));
  return app;
}
