import {
  AppBridge,
  isToolVisibilityModelOnly,
  PostMessageTransport,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import {
  assertSeparateSandboxOrigin,
  MCP_APP_INNER_SANDBOX,
  MCP_APP_OUTER_SANDBOX,
} from './security.js';
import type { McpResourceContent, McpUiPermissions, McpUiResourceCsp } from './types.js';

export interface AppHostInput {
  client: Client;
  iframe: HTMLIFrameElement;
  sandboxUrl: string;
  resource: McpResourceContent;
  tool: Tool;
  tools: Tool[];
  args: Record<string, unknown>;
  result: CallToolResult;
  approveToolCall?: (tool: Tool, args: Record<string, unknown>) => boolean | Promise<boolean>;
}

function appMetadata(resource: McpResourceContent): {
  csp?: McpUiResourceCsp;
  permissions?: McpUiPermissions;
} {
  const meta = resource._meta;
  const ui =
    meta?.ui && typeof meta.ui === 'object' ? (meta.ui as Record<string, unknown>) : undefined;
  return {
    ...(ui?.csp && typeof ui.csp === 'object' ? { csp: ui.csp as McpUiResourceCsp } : {}),
    ...(ui?.permissions && typeof ui.permissions === 'object'
      ? { permissions: ui.permissions as McpUiPermissions }
      : {}),
  };
}

function decodeResource(resource: McpResourceContent): string {
  if (resource.text !== undefined) return resource.text;
  if (resource.blob !== undefined) {
    const binary = atob(resource.blob);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  throw new Error('MCP App resource contains neither text nor blob content.');
}

function waitForSandbox(iframe: HTMLIFrameElement, sandboxUrl: URL): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', listener);
      reject(new Error('Timed out waiting for the MCP App sandbox proxy.'));
    }, 10_000);
    const listener = (event: MessageEvent) => {
      if (
        event.source === iframe.contentWindow &&
        event.origin === sandboxUrl.origin &&
        event.data?.method === 'ui/notifications/sandbox-proxy-ready'
      ) {
        window.clearTimeout(timeout);
        window.removeEventListener('message', listener);
        resolve();
      }
    };
    window.addEventListener('message', listener);
  });
}

export function isAppToolAllowed(tool: Tool): boolean {
  return !isToolVisibilityModelOnly(tool);
}

export function formatAppToolApproval(tool: Tool, args: Record<string, unknown>): string {
  return [
    'An MCP App is requesting a tool call.',
    '',
    `Tool: ${tool.name}`,
    'Arguments:',
    JSON.stringify(args, null, 2),
    '',
    'Allow this call?',
  ].join('\n');
}

export async function mountMcpApp(input: AppHostInput): Promise<() => Promise<void>> {
  assertSeparateSandboxOrigin(window.location.href, input.sandboxUrl);
  const sandboxUrl = new URL(input.sandboxUrl);
  const { csp, permissions } = appMetadata(input.resource);
  if (csp) sandboxUrl.searchParams.set('csp', JSON.stringify(csp));

  input.iframe.setAttribute('sandbox', MCP_APP_OUTER_SANDBOX);
  const ready = waitForSandbox(input.iframe, sandboxUrl);
  input.iframe.src = sandboxUrl.href;
  await ready;

  const bridge = new AppBridge(
    null,
    { name: 'Storybook MCP DevTools', version: '0.1.0' },
    {
      openLinks: {},
      serverTools: {
        listChanged: input.client.getServerCapabilities()?.tools?.listChanged === true,
      },
      serverResources: {
        listChanged: input.client.getServerCapabilities()?.resources?.listChanged === true,
      },
    },
    {
      hostContext: {
        platform: 'web',
        theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        displayMode: 'inline',
        availableDisplayModes: ['inline'],
        toolInfo: { tool: input.tool },
      },
    },
  );

  bridge.onopenlink = async ({ url }) => {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`MCP App link protocol is not allowed: ${parsed.protocol}`);
    }
    if (!window.confirm(`An MCP App wants to open this link:\n\n${parsed.href}\n\nAllow?`)) {
      throw new Error('User denied the MCP App link request.');
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return {};
  };
  bridge.oncalltool = async (params) => {
    const requested = input.tools.find((candidate) => candidate.name === params.name);
    if (!requested || !isAppToolAllowed(requested)) {
      throw new Error(`MCP App is not allowed to call tool: ${params.name}`);
    }
    const args =
      params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
        ? params.arguments
        : {};
    const approve =
      input.approveToolCall ??
      ((tool: Tool, arguments_: Record<string, unknown>) =>
        window.confirm(formatAppToolApproval(tool, arguments_)));
    if (!(await approve(requested, args))) {
      throw new Error(`User denied MCP App tool call: ${params.name}`);
    }
    return (await input.client.callTool(params)) as CallToolResult;
  };
  bridge.onlistresources = async (params) => input.client.listResources(params);
  bridge.onlistresourcetemplates = async (params) => input.client.listResourceTemplates(params);
  bridge.onreadresource = async (params) => input.client.readResource(params);
  bridge.onrequestdisplaymode = async () => ({ mode: 'inline' });
  bridge.oninitialized = () => {
    void bridge.sendToolInput({ arguments: input.args });
    void bridge.sendToolResult(input.result);
  };

  await bridge.connect(
    new PostMessageTransport(input.iframe.contentWindow!, input.iframe.contentWindow!),
  );
  await bridge.sendSandboxResourceReady({
    html: decodeResource(input.resource),
    ...(csp ? { csp } : {}),
    ...(permissions ? { permissions } : {}),
    sandbox: MCP_APP_INNER_SANDBOX,
  });

  return async () => {
    await bridge.teardownResource({}).catch(() => undefined);
    await bridge.close();
    input.iframe.removeAttribute('src');
  };
}
