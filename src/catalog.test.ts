import { describe, expect, it } from 'vite-plus/test';

import { captureCatalogSnapshot, getToolAppResourceUri, listAllTools } from './catalog.js';
import type { McpCatalogAdapter, McpTool } from './types.js';

const baseTool: McpTool = {
  name: 'counter',
  description: 'Increment a counter.',
  inputSchema: { type: 'object' },
};

describe('MCP catalog', () => {
  it('prefers stable nested App metadata and tolerates the deprecated flat field', () => {
    expect(
      getToolAppResourceUri({
        _meta: {
          ui: { resourceUri: 'ui://stable' },
          'ui/resourceUri': 'ui://deprecated',
        },
      }),
    ).toBe('ui://stable');
    expect(getToolAppResourceUri({ _meta: { 'ui/resourceUri': 'ui://deprecated' } })).toBe(
      'ui://deprecated',
    );
  });

  it('paginates tools/list and rejects cursor loops', async () => {
    const pages = new Map([
      [undefined, { tools: [baseTool], nextCursor: 'two' }],
      ['two', { tools: [{ ...baseTool, name: 'time' }] }],
    ]);
    await expect(listAllTools(async (cursor) => pages.get(cursor)!)).resolves.toHaveLength(2);

    await expect(listAllTools(async () => ({ tools: [], nextCursor: 'same' }))).rejects.toThrow(
      'repeated cursor',
    );
  });

  it('captures identity, capabilities, schemas, annotations, and App resource metadata', async () => {
    const adapter: McpCatalogAdapter = {
      getServerIdentity: () => ({ name: 'sample', version: '1.0.0' }),
      getCapabilities: () => ({ tools: { listChanged: true } }),
      listTools: async () => ({
        tools: [
          {
            ...baseTool,
            outputSchema: { type: 'object' },
            annotations: { readOnlyHint: false },
            _meta: { ui: { resourceUri: 'ui://counter' } },
          },
        ],
      }),
      readResource: async () => ({
        contents: [
          {
            uri: 'ui://counter',
            mimeType: 'text/html;profile=mcp-app',
            text: '<!doctype html>',
            _meta: {
              ui: {
                csp: { connectDomains: ['https://api.example.com'] },
                permissions: { clipboardWrite: {} },
              },
            },
          },
        ],
      }),
    };

    const snapshot = await captureCatalogSnapshot(adapter, '2026-01-01T00:00:00Z');
    expect(snapshot).toMatchObject({
      snapshotVersion: 1,
      capturedAt: '2026-01-01T00:00:00Z',
      server: { name: 'sample' },
      tools: [
        {
          name: 'counter',
          outputSchema: { type: 'object' },
          app: {
            uri: 'ui://counter',
            mimeType: 'text/html;profile=mcp-app',
            csp: { connectDomains: ['https://api.example.com'] },
          },
        },
      ],
    });
  });
});
