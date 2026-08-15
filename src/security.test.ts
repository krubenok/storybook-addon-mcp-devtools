import { describe, expect, it } from 'vite-plus/test';

import {
  assertSeparateSandboxOrigin,
  buildPermissionAllowlist,
  buildSandboxCsp,
  MCP_APP_INNER_SANDBOX,
  MCP_APP_OUTER_SANDBOX,
} from './security.js';

describe('MCP App sandbox security', () => {
  it('uses restrictive CSP defaults', () => {
    const csp = buildSandboxCsp();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it('maps only declared domains and permissions', () => {
    const csp = buildSandboxCsp({
      connectDomains: ['https://api.example.com/path'],
      resourceDomains: ['https://cdn.example.com/assets'],
      frameDomains: ['https://video.example.com/embed'],
      baseUriDomains: ['https://base.example.com/root'],
    });
    expect(csp).toContain('connect-src https://api.example.com');
    expect(csp).toContain('script-src');
    expect(csp).toContain('https://cdn.example.com');
    expect(csp).toContain('frame-src https://video.example.com');
    expect(csp).toContain('base-uri https://base.example.com');
    expect(buildPermissionAllowlist({ camera: {}, clipboardWrite: {} })).toBe(
      "camera 'self'; clipboard-write 'self'",
    );
  });

  it('requires host and sandbox to use separate origins', () => {
    expect(() =>
      assertSeparateSandboxOrigin(
        'http://localhost:6006/?path=/mcp',
        'http://localhost:6006/sandbox.html',
      ),
    ).toThrow('separate origins');
    expect(() =>
      assertSeparateSandboxOrigin('http://localhost:6006', 'http://localhost:6124/sandbox.html'),
    ).not.toThrow();
  });

  it('keeps the untrusted inner App on an opaque origin', () => {
    expect(MCP_APP_OUTER_SANDBOX).toContain('allow-same-origin');
    expect(MCP_APP_INNER_SANDBOX).not.toContain('allow-same-origin');
  });
});
