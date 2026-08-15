import { randomUUID } from 'node:crypto';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const APP_URI = 'ui://storybook-mcp-devtools/counter';
const APP_MIME_TYPE = 'text/html;profile=mcp-app';
let count = 0;

const appHtml = String.raw`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Counter MCP App</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { margin: 0; padding: 20px; background: transparent; }
      counter-app { display: block; border: 1px solid #94a3b8; border-radius: 12px; padding: 20px; }
      button { border: 0; border-radius: 8px; padding: 10px 14px; background: #2563eb; color: white; font-weight: 700; cursor: pointer; }
      output { display: block; font-size: 3rem; font-weight: 800; margin: 12px 0; }
    </style>
  </head>
  <body>
    <counter-app></counter-app>
    <script>
      class CounterApp extends HTMLElement {
        connectedCallback() {
          this.innerHTML = '<strong>MCP counter</strong><output>—</output><button type="button">Increment from app</button><p>Waiting for tool result…</p>';
          this.querySelector('button').addEventListener('click', () => callTool());
        }
        update(value, message) {
          this.querySelector('output').textContent = String(value);
          this.querySelector('p').textContent = message;
        }
      }
      customElements.define('counter-app', CounterApp);
      const view = document.querySelector('counter-app');
      let nextId = 1;
      const pending = new Map();
      function send(message) { window.parent.postMessage(message, '*'); }
      function request(method, params) {
        const id = nextId++;
        send({ jsonrpc: '2.0', id, method, params });
        return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      }
      async function callTool() {
        const response = await request('tools/call', { name: 'increment-counter', arguments: { amount: 1 } });
        view.update(response.structuredContent.count, 'Incremented through the MCP Apps bridge.');
      }
      window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (message.id && pending.has(message.id)) {
          const waiter = pending.get(message.id);
          pending.delete(message.id);
          if (message.error) waiter.reject(new Error(message.error.message));
          else waiter.resolve(message.result);
          return;
        }
        if (message.method === 'ui/notifications/tool-input') {
          view.querySelector('p').textContent = 'Received arguments: ' + JSON.stringify(message.params.arguments);
        }
        if (message.method === 'ui/notifications/tool-result') {
          const value = message.params.structuredContent?.count ?? '—';
          view.update(value, 'Rendered from structuredContent.');
        }
        if (message.method === 'ui/resource-teardown' && message.id) {
          view.querySelector('p').textContent = 'Host requested teardown.';
          send({ jsonrpc: '2.0', id: message.id, result: {} });
        }
      });
      request('ui/initialize', {
        appInfo: { name: 'Counter Web Component', version: '1.0.0' },
        appCapabilities: {},
        protocolVersion: '2026-01-26'
      }).then(() => send({
        jsonrpc: '2.0',
        method: 'ui/notifications/initialized',
        params: {}
      }));
    </script>
  </body>
</html>`;

function createServer(): McpServer {
  const server = new McpServer(
    { name: 'storybook-mcp-devtools-sample', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.registerTool(
    'increment-counter',
    {
      title: 'Increment counter',
      description: 'Increment a local demonstration counter by an explicit amount.',
      inputSchema: {
        amount: z.number().int().min(1).max(10).default(1),
      },
      outputSchema: {
        count: z.number().int(),
        changedBy: z.number().int(),
      },
      annotations: {
        title: 'Increment counter',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: {
          resourceUri: APP_URI,
          visibility: ['model', 'app'],
        },
      },
    },
    async ({ amount }) => {
      count += amount;
      return {
        content: [{ type: 'text', text: `Counter is now ${count}.` }],
        structuredContent: { count, changedBy: amount },
      };
    },
  );

  server.registerTool(
    'current-time',
    {
      title: 'Current time',
      description: 'Return the current time for a requested IANA time zone.',
      inputSchema: { timeZone: z.string().default('UTC') },
      outputSchema: { iso: z.string(), formatted: z.string(), timeZone: z.string() },
      annotations: {
        title: 'Current time',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ timeZone }) => {
      const now = new Date();
      let formatted: string;
      try {
        formatted = new Intl.DateTimeFormat('en', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone,
        }).format(now);
      } catch {
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown IANA time zone: ${timeZone}` }],
        };
      }
      return {
        content: [{ type: 'text', text: formatted }],
        structuredContent: { iso: now.toISOString(), formatted, timeZone },
      };
    },
  );

  server.registerResource(
    'counter-app',
    APP_URI,
    {
      title: 'Counter Web Component',
      description: 'A framework-neutral MCP App implemented as a custom element.',
      mimeType: APP_MIME_TYPE,
      _meta: {
        ui: {
          csp: {},
          permissions: {},
          prefersBorder: true,
        },
      },
    },
    async () => ({
      contents: [
        {
          uri: APP_URI,
          mimeType: APP_MIME_TYPE,
          text: appHtml,
          _meta: {
            ui: {
              csp: {},
              permissions: {},
              prefersBorder: true,
            },
          },
        },
      ],
    }),
  );

  return server;
}

const app = express();
app.use(express.json({ limit: '2mb' }));
const transports = new Map<string, StreamableHTTPServerTransport>();

app.all('/mcp', async (req, res) => {
  const sessionId = req.header('mcp-session-id');
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport && req.method === 'POST') {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (id) => {
        transports.set(id, transport!);
      },
    });
    transport.onclose = () => {
      if (transport?.sessionId) transports.delete(transport.sessionId);
    };
    await createServer().connect(transport);
  }

  if (!transport) {
    res.status(400).json({ error: 'Missing or unknown MCP session.' });
    return;
  }
  await transport.handleRequest(req, res, req.body);
});

app.listen(6123, '127.0.0.1', () => {
  console.log('Sample MCP server listening at http://127.0.0.1:6123/mcp');
});
