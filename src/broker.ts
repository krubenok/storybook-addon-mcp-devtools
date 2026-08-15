import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';

import { captureCatalogSnapshot } from './catalog.js';
import type { ValidatedAddonOptions } from './config.js';
import { McpSession } from './mcp-session.js';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
};

const CSRF_HEADER = 'x-mcp-devtools-token';

interface RequestRejection {
  status: number;
  message: string;
}

function singleHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? undefined : value;
}

function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function validateProtocolRequest(
  req: IncomingMessage,
  csrfToken: string,
): RequestRejection | undefined {
  const origin = singleHeader(req, 'origin');
  const host = singleHeader(req, 'host');
  if (!origin || !host) {
    return { status: 403, message: 'Broker requests require a same-origin browser context.' };
  }
  try {
    if (new URL(origin).host !== host) {
      return { status: 403, message: 'Cross-origin broker requests are not allowed.' };
    }
  } catch {
    return { status: 403, message: 'Broker request origin is invalid.' };
  }

  const mediaType = singleHeader(req, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return { status: 415, message: 'Broker requests require application/json.' };
  }
  if (!tokenMatches(singleHeader(req, CSRF_HEADER), csrfToken)) {
    return { status: 403, message: 'Broker CSRF token is missing or invalid.' };
  }
  return undefined;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<JsonRpcRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as JsonRpcRequest;
}

function errorResponse(id: JsonRpcRequest['id'], error: unknown) {
  const candidate = error as Error & { code?: number; data?: unknown };
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    error: {
      code: candidate.code ?? -32603,
      message: candidate.message ?? String(error),
      ...(candidate.data !== undefined ? { data: candidate.data } : {}),
    },
  };
}

export interface BrokerHandlers {
  status(_req: IncomingMessage, res: ServerResponse): void;
  catalog(_req: IncomingMessage, res: ServerResponse): Promise<void>;
  protocol(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

export function createBrokerHandlers(options: ValidatedAddonOptions): BrokerHandlers {
  const session = options.endpoint ? new McpSession(options.endpoint, options.headers) : undefined;
  const csrfToken = randomBytes(32).toString('base64url');

  return {
    status(_req, res) {
      writeJson(res, 200, {
        mode: session ? 'live' : 'snapshot',
        brokerPath: options.brokerPath,
        snapshotUrl: options.snapshotUrl,
        csrfToken,
        ...(options.sandboxUrl ? { sandboxUrl: options.sandboxUrl.href } : {}),
      });
    },

    async catalog(_req, res) {
      if (!session) {
        writeJson(res, 404, { error: 'Live MCP is not configured.' });
        return;
      }
      try {
        await session.connect();
        writeJson(res, 200, await captureCatalogSnapshot(session));
      } catch (error) {
        writeJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
      }
    },

    async protocol(req, res) {
      const rejection = validateProtocolRequest(req, csrfToken);
      if (rejection) {
        writeJson(res, rejection.status, errorResponse(undefined, new Error(rejection.message)));
        return;
      }
      if (!session) {
        writeJson(res, 503, {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32002, message: 'Live MCP is not configured.' },
        });
        return;
      }

      let message: JsonRpcRequest;
      try {
        message = await readJson(req);
        await session.connect();
      } catch (error) {
        writeJson(res, 400, errorResponse(undefined, error));
        return;
      }

      if (message.id === undefined) {
        res.writeHead(204);
        res.end();
        return;
      }

      try {
        const params = message.params ?? {};
        let result: unknown;
        switch (message.method) {
          case 'initialize':
            result = {
              protocolVersion: LATEST_PROTOCOL_VERSION,
              capabilities: session.getCapabilities(),
              serverInfo: session.getServerIdentity(),
            };
            break;
          case 'ping':
            result = {};
            break;
          case 'tools/list':
            result = await session.listTools(
              typeof params.cursor === 'string' ? params.cursor : undefined,
            );
            break;
          case 'tools/call':
            if (typeof params.name !== 'string') throw new Error('tools/call requires a name.');
            result = await session.callTool(
              params.name,
              params.arguments &&
                typeof params.arguments === 'object' &&
                !Array.isArray(params.arguments)
                ? (params.arguments as Record<string, unknown>)
                : {},
            );
            break;
          case 'resources/list':
            result = await session.listResources(
              typeof params.cursor === 'string' ? params.cursor : undefined,
            );
            break;
          case 'resources/templates/list':
            result = await session.listResourceTemplates(
              typeof params.cursor === 'string' ? params.cursor : undefined,
            );
            break;
          case 'resources/read':
            if (typeof params.uri !== 'string') throw new Error('resources/read requires a URI.');
            result = await session.readResource(params.uri);
            break;
          default:
            throw Object.assign(new Error(`Unsupported broker method: ${message.method}`), {
              code: -32601,
            });
        }
        writeJson(res, 200, { jsonrpc: '2.0', id: message.id, result });
      } catch (error) {
        writeJson(res, 200, errorResponse(message.id, error));
      }
    },
  };
}
