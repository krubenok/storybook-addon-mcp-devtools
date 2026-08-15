# Contributing

Thank you for improving Storybook MCP DevTools.

## Setup

Install [Vite+](https://viteplus.dev/), then run:

```bash
vp install
vp run sample
```

Before opening a pull request:

```bash
vp check
vp test
vp pack
vp run storybook:build
```

## Design constraints

- Use public MCP, MCP Apps, Storybook, and package documentation.
- Keep protocol, session, catalog, result, and security logic framework-neutral.
- Keep React-specific code inside the Storybook manager UI.
- Never auto-call tools. Preserve visible arguments and explicit user action.
- Treat server-provided names, descriptions, annotations, schemas, HTML, and metadata as untrusted.
- Do not expose endpoint credentials to browser bundles or snapshots.
- Do not weaken the separate-origin sandbox requirement to make a demo work.
- Add tests for protocol parsing, pagination, normalization, configuration, snapshot, or security behavior that changes.

## Pull requests

Keep changes focused, explain user-visible behavior and security implications, and include the commands used to validate the change. Package publication is intentionally out of scope until the API and security model mature.
