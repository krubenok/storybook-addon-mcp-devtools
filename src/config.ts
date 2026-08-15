import { BROKER_PATH } from './constants.js';
import type { AddonOptions } from './types.js';

export interface ValidatedAddonOptions {
  endpoint?: URL;
  headers: Record<string, string>;
  snapshotUrl: string;
  brokerPath: string;
  sandboxUrl?: URL;
}

function parseHttpUrl(value: string, field: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${field} must use http or https.`);
  }
  return url;
}

export function validateAddonOptions(options: AddonOptions = {}): ValidatedAddonOptions {
  if (options.endpoint && new URL(options.endpoint).username) {
    throw new Error('endpoint must not contain credentials; use server-side headers instead.');
  }

  const brokerPath = options.brokerPath ?? BROKER_PATH;
  if (!brokerPath.startsWith('/') || brokerPath.includes('..')) {
    throw new Error('brokerPath must be an absolute URL path without parent traversal.');
  }

  return {
    ...(options.endpoint ? { endpoint: parseHttpUrl(options.endpoint, 'endpoint') } : {}),
    headers: { ...options.headers },
    snapshotUrl: options.snapshotUrl ?? `${brokerPath}/catalog.json`,
    brokerPath,
    ...(options.sandboxUrl ? { sandboxUrl: parseHttpUrl(options.sandboxUrl, 'sandboxUrl') } : {}),
  };
}
