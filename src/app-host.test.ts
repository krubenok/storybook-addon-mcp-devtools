import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vite-plus/test';

import { formatAppToolApproval, isAppToolAllowed } from './app-host.js';

function tool(visibility?: string[]): Tool {
  return {
    name: 'counter',
    inputSchema: { type: 'object' },
    ...(visibility ? { _meta: { ui: { visibility } } } : {}),
  };
}

describe('MCP App tool approval', () => {
  it('blocks model-only tools and permits default or App-visible tools', () => {
    expect(isAppToolAllowed(tool(['model']))).toBe(false);
    expect(isAppToolAllowed(tool(['app']))).toBe(true);
    expect(isAppToolAllowed(tool())).toBe(true);
  });

  it('shows the exact tool name and arguments in the approval prompt', () => {
    const prompt = formatAppToolApproval(tool(), { amount: 2 });
    expect(prompt).toContain('Tool: counter');
    expect(prompt).toContain('"amount": 2');
  });
});
