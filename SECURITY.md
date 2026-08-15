# Security policy

This repository is an early developer-tool preview. Do not treat its sample localhost sandbox as a production hosting service.

## Reporting

Please report vulnerabilities privately through GitHub's security advisory flow for this repository. Do not include credentials, customer data, or sensitive server responses in public issues.

## Supported boundary

The addon requires a Node-side broker for live MCP access and a separate-origin sandbox proxy for MCP Apps. The broker requires same-origin JSON requests plus a per-process CSRF token. The untrusted inner App runs with an opaque origin, and App-initiated tool calls require explicit approval. Static builds support catalog discovery only. Direct same-origin rendering of server-provided HTML, automatic tool calls, browser-bundled credentials, stdio, and OAuth are not supported by the MVP.
