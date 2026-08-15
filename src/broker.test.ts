import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vite-plus/test';

import { validateProtocolRequest } from './broker.js';

function request(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage;
}

describe('broker request security', () => {
  const token = 'test-csrf-token';

  it('accepts same-origin JSON requests with the session token', () => {
    expect(
      validateProtocolRequest(
        request({
          host: 'localhost:6006',
          origin: 'http://localhost:6006',
          'content-type': 'application/json; charset=utf-8',
          'x-mcp-devtools-token': token,
        }),
        token,
      ),
    ).toBeUndefined();
  });

  it('rejects cross-origin, simple-content, and tokenless requests', () => {
    expect(
      validateProtocolRequest(
        request({
          host: 'localhost:6006',
          origin: 'https://attacker.example',
          'content-type': 'application/json',
          'x-mcp-devtools-token': token,
        }),
        token,
      )?.status,
    ).toBe(403);
    expect(
      validateProtocolRequest(
        request({
          host: 'localhost:6006',
          origin: 'http://localhost:6006',
          'content-type': 'text/plain',
          'x-mcp-devtools-token': token,
        }),
        token,
      )?.status,
    ).toBe(415);
    expect(
      validateProtocolRequest(
        request({
          host: 'localhost:6006',
          origin: 'http://localhost:6006',
          'content-type': 'application/json',
        }),
        token,
      )?.status,
    ).toBe(403);
  });
});
