import { describe, expect, it } from 'vite-plus/test';

import { parseSnapshotArgs } from './snapshot.js';

describe('snapshot CLI arguments', () => {
  it('parses endpoint and output', () => {
    expect(
      parseSnapshotArgs([
        '--endpoint',
        'https://mcp.example.com/api',
        '--output',
        'docs/catalog.json',
      ]),
    ).toEqual({
      endpoint: new URL('https://mcp.example.com/api'),
      output: 'docs/catalog.json',
    });
  });

  it('requires an HTTP endpoint', () => {
    expect(() => parseSnapshotArgs([])).toThrow('--endpoint is required');
    expect(() => parseSnapshotArgs(['--endpoint', 'file:///tmp/socket'])).toThrow(
      'must use http or https',
    );
  });
});
