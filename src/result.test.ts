import { describe, expect, it } from 'vite-plus/test';

import { normalizeToolResult } from './result.js';

describe('tool result normalization', () => {
  it('preserves every content block, structured content, error state, and elapsed time', () => {
    expect(
      normalizeToolResult(
        {
          content: [
            { type: 'text', text: 'hello' },
            { type: 'image', data: 'base64', mimeType: 'image/png' },
          ],
          structuredContent: { value: 42 },
          isError: true,
        },
        12.5,
      ),
    ).toEqual({
      content: [
        { type: 'text', text: 'hello' },
        { type: 'image', data: 'base64', mimeType: 'image/png' },
      ],
      structuredContent: { value: 42 },
      isError: true,
      elapsedMs: 12.5,
    });
  });

  it('normalizes protocol failures separately from tool-level errors', () => {
    const error = Object.assign(new Error('Server disconnected'), {
      code: -32000,
      data: { retryable: true },
    });
    expect(normalizeToolResult(undefined, 8, error)).toMatchObject({
      content: [],
      isError: true,
      protocolError: {
        code: -32000,
        message: 'Server disconnected',
        data: { retryable: true },
      },
    });
  });
});
