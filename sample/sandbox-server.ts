import express from 'express';

import { buildSandboxCsp, MCP_APP_INNER_SANDBOX } from '../src/security.ts';
import type { McpUiResourceCsp } from '../src/types.ts';

const allowedHostOrigins = (
  process.env.MCP_SANDBOX_ALLOWED_HOSTS ?? 'http://localhost:6006,http://127.0.0.1:6006'
)
  .split(',')
  .map((value) => new URL(value.trim()).origin);

const sandboxScript = String.raw`
const ALLOWED_HOST_ORIGINS = new Set(${JSON.stringify(allowedHostOrigins)});
const INNER_SANDBOX = ${JSON.stringify(MCP_APP_INNER_SANDBOX)};
if (window.self === window.top) throw new Error('Sandbox proxy must be embedded.');
if (!document.referrer) throw new Error('Sandbox proxy requires a referrer.');
const HOST_ORIGIN = new URL(document.referrer).origin;
if (!ALLOWED_HOST_ORIGINS.has(HOST_ORIGIN)) throw new Error('Embedding origin is not allowed.');
const OWN_ORIGIN = window.location.origin;
try {
  window.top.document;
  throw new Error('Sandbox isolation self-test failed.');
} catch (error) {
  if (error instanceof Error && error.message === 'Sandbox isolation self-test failed.') throw error;
}
const inner = document.createElement('iframe');
inner.style = 'width:100%;height:100%;border:0';
inner.setAttribute('sandbox', INNER_SANDBOX);
document.body.append(inner);
const permissionNames = {
  camera: 'camera',
  microphone: 'microphone',
  geolocation: 'geolocation',
  clipboardWrite: 'clipboard-write'
};
window.addEventListener('message', (event) => {
  if (event.source === window.parent) {
    if (event.origin !== HOST_ORIGIN) return;
    if (event.data?.method === 'ui/notifications/sandbox-resource-ready') {
      const { html, sandbox, permissions } = event.data.params ?? {};
      if (sandbox !== INNER_SANDBOX) throw new Error('Unsafe inner sandbox policy.');
      if (permissions && typeof permissions === 'object') {
        const allow = Object.keys(permissions)
          .filter((key) => permissionNames[key])
          .map((key) => permissionNames[key] + " 'self'")
          .join('; ');
        if (allow) inner.setAttribute('allow', allow);
      }
      if (typeof html === 'string') {
        inner.srcdoc = html;
      }
      return;
    }
    inner.contentWindow?.postMessage(event.data, '*');
    return;
  }
  if (event.source === inner.contentWindow) {
    if (event.origin !== 'null') return;
    window.parent.postMessage(event.data, HOST_ORIGIN);
  }
});
window.parent.postMessage({
  jsonrpc: '2.0',
  method: 'ui/notifications/sandbox-proxy-ready',
  params: {}
}, HOST_ORIGIN);
`;

const sandboxHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="light dark">
    <title>MCP App sandbox proxy</title>
    <style>html,body{margin:0;width:100%;height:100%;background:transparent}body{display:flex}iframe{flex:1}</style>
  </head>
  <body><script type="module" src="/sandbox.js"></script></body>
</html>`;

const app = express();
app.get('/sandbox.js', (_req, res) => {
  res.type('text/javascript').send(sandboxScript);
});
app.get('/sandbox.html', (req, res) => {
  let csp: McpUiResourceCsp | undefined;
  if (typeof req.query.csp === 'string') {
    try {
      csp = JSON.parse(req.query.csp) as McpUiResourceCsp;
    } catch {
      res.status(400).send('Invalid CSP metadata.');
      return;
    }
  }
  res.setHeader('content-security-policy', buildSandboxCsp(csp)).type('html').send(sandboxHtml);
});
app.listen(6124, '127.0.0.1', () => {
  console.log('MCP App sandbox listening at http://127.0.0.1:6124/sandbox.html');
});
