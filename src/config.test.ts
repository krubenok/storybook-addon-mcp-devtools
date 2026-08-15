import { describe, expect, it } from 'vite-plus/test';

import { validateAddonOptions } from './config.js';

describe('addon configuration', () => {
  it('applies safe defaults without enabling live calls', () => {
    expect(validateAddonOptions()).toMatchObject({
      headers: {},
      brokerPath: '/__mcp-devtools',
      snapshotUrl: '/__mcp-devtools/catalog.json',
    });
  });

  it('accepts Streamable HTTP endpoint and separate sandbox URLs', () => {
    const result = validateAddonOptions({
      endpoint: 'http://127.0.0.1:6123/mcp',
      sandboxUrl: 'http://127.0.0.1:6124/sandbox.html',
    });
    expect(result.endpoint?.pathname).toBe('/mcp');
    expect(result.sandboxUrl?.port).toBe('6124');
  });

  it('rejects URL credentials, unsupported protocols, and unsafe route paths', () => {
    expect(() => validateAddonOptions({ endpoint: 'https://user:secret@example.com/mcp' })).toThrow(
      'must not contain credentials',
    );
    expect(() => validateAddonOptions({ endpoint: 'file:///tmp/mcp' })).toThrow(
      'must use http or https',
    );
    expect(() => validateAddonOptions({ brokerPath: '/../secret' })).toThrow(
      'without parent traversal',
    );
  });
});
