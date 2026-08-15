import type { McpUiPermissions, McpUiResourceCsp } from './types.js';

export const MCP_APP_OUTER_SANDBOX = 'allow-scripts allow-same-origin allow-forms';
export const MCP_APP_INNER_SANDBOX = 'allow-scripts allow-forms';

const PERMISSIONS: Record<keyof McpUiPermissions, string> = {
  camera: 'camera',
  microphone: 'microphone',
  geolocation: 'geolocation',
  clipboardWrite: 'clipboard-write',
};

function origins(values: string[] | undefined, fallback: string): string {
  if (!values?.length) return fallback;
  return values.map((value) => new URL(value).origin).join(' ');
}

export function buildSandboxCsp(csp?: McpUiResourceCsp): string {
  const externalResources = csp?.resourceDomains?.length
    ? ` ${origins(csp.resourceDomains, '')}`
    : '';
  const resources = `'self' data:${externalResources}`;
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline'${externalResources}`,
    `style-src 'self' 'unsafe-inline'${externalResources}`,
    `img-src ${resources}`,
    `font-src ${resources}`,
    `media-src ${resources}`,
    `connect-src ${origins(csp?.connectDomains, "'none'")}`,
    `frame-src ${origins(csp?.frameDomains, "'none'")}`,
    `base-uri ${origins(csp?.baseUriDomains, "'self'")}`,
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}

export function buildPermissionAllowlist(permissions?: McpUiPermissions): string {
  if (!permissions) return '';
  return Object.entries(PERMISSIONS)
    .filter(([key]) => key in permissions)
    .map(([, feature]) => `${feature} 'self'`)
    .join('; ');
}

export function assertSeparateSandboxOrigin(hostUrl: string, sandboxUrl: string): void {
  if (new URL(hostUrl).origin === new URL(sandboxUrl).origin) {
    throw new Error('MCP Apps require the sandbox proxy and Storybook host on separate origins.');
  }
}
