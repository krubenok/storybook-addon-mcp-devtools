import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export class BrokerTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T) => void;
  readonly #url: string;
  readonly #csrfToken: string;
  #started = false;

  constructor(url: string, csrfToken: string) {
    this.#url = url;
    this.#csrfToken = csrfToken;
  }

  async start(): Promise<void> {
    if (this.#started) throw new Error('Broker transport is already started.');
    this.#started = true;
  }

  async send(message: JSONRPCMessage): Promise<void> {
    try {
      const response = await fetch(this.#url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mcp-devtools-token': this.#csrfToken,
        },
        body: JSON.stringify(message),
      });
      if (response.status === 204) return;
      const payload = (await response.json()) as JSONRPCMessage;
      if (!response.ok && !('error' in payload)) {
        throw new Error(`Broker request failed with HTTP ${response.status}.`);
      }
      this.onmessage?.(payload);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.onerror?.(normalized);
      throw normalized;
    }
  }

  async close(): Promise<void> {
    this.#started = false;
    this.onclose?.();
  }
}
