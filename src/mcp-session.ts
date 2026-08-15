import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  CallToolResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
} from '@modelcontextprotocol/sdk/types.js';

import type {
  McpCatalogAdapter,
  McpResourceResult,
  McpServerIdentity,
  McpToolResult,
  ToolPage,
} from './types.js';

const CLIENT_INFO = { name: 'storybook-addon-mcp-devtools', version: '0.1.0' };

export class McpSession implements McpCatalogAdapter {
  #client = new Client(CLIENT_INFO);
  readonly #endpoint: URL;
  readonly #headers: Record<string, string>;
  #connected?: Promise<void>;

  constructor(endpoint: URL, headers: Record<string, string> = {}) {
    this.#endpoint = endpoint;
    this.#headers = headers;
  }

  get client(): Client {
    return this.#client;
  }

  #resetClient(client: Client): void {
    if (this.#client === client) {
      this.#client = new Client(CLIENT_INFO);
      this.#connected = undefined;
    }
  }

  async #invalidateClient(client: Client, error: unknown): Promise<never> {
    this.#resetClient(client);
    try {
      await client.close();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        'MCP request and failed-session cleanup both failed.',
      );
    }
    throw error;
  }

  connect(): Promise<void> {
    if (!this.#connected) {
      const client = this.#client;
      const transport = new StreamableHTTPClientTransport(this.#endpoint, {
        requestInit: { headers: this.#headers },
      });
      this.#connected = client
        .connect(transport)
        .then(() => {
          const protocolClose = transport.onclose;
          transport.onclose = () => {
            protocolClose?.();
            this.#resetClient(client);
          };
        })
        .catch(async (error: unknown) => {
          return this.#invalidateClient(client, error);
        });
    }
    return this.#connected;
  }

  async listTools(cursor?: string): Promise<ToolPage> {
    await this.connect();
    const client = this.client;
    try {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      return {
        tools: page.tools,
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    } catch (error) {
      return this.#invalidateClient(client, error);
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.connect();
    const client = this.client;
    try {
      return (await client.callTool({ name, arguments: args })) as CallToolResult;
    } catch (error) {
      return this.#invalidateClient(client, error);
    }
  }

  async readResource(uri: string): Promise<McpResourceResult> {
    await this.connect();
    const client = this.client;
    try {
      return await client.readResource({ uri });
    } catch (error) {
      return this.#invalidateClient(client, error);
    }
  }

  async listResources(cursor?: string): Promise<ListResourcesResult> {
    await this.connect();
    const client = this.client;
    try {
      return await client.listResources(cursor ? { cursor } : undefined);
    } catch (error) {
      return this.#invalidateClient(client, error);
    }
  }

  async listResourceTemplates(cursor?: string): Promise<ListResourceTemplatesResult> {
    await this.connect();
    const client = this.client;
    try {
      return await client.listResourceTemplates(cursor ? { cursor } : undefined);
    } catch (error) {
      return this.#invalidateClient(client, error);
    }
  }

  getServerIdentity(): McpServerIdentity {
    const version = this.client.getServerVersion();
    return {
      name: version?.name ?? this.#endpoint.host,
      version: version?.version ?? 'unknown',
    };
  }

  getCapabilities(): Record<string, unknown> {
    return this.client.getServerCapabilities() ?? {};
  }
}
