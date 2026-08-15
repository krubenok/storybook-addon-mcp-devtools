import Ajv from 'ajv';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addons, types } from 'storybook/manager-api';
import type { API } from 'storybook/manager-api';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import { mountMcpApp } from './app-host.js';
import { BrokerTransport } from './broker-transport.js';
import { getToolAppResourceUri, listAllTools, parseAppResource } from './catalog.js';
import { ADDON_ID, BROKER_PATH, RESOURCE_MIME_TYPE, TAB_ID } from './constants.js';
import { normalizeToolResult } from './result.js';
import type {
  CatalogSnapshot,
  CatalogTool,
  McpResourceContent,
  NormalizedToolResult,
  StoryMcpParameters,
} from './types.js';

declare global {
  interface Window {
    __MCP_DEVTOOLS_CONFIG__?: {
      brokerPath: string;
      snapshotUrl: string;
      sandboxUrl?: string;
    };
  }
}

interface RuntimeConfig {
  brokerPath: string;
  snapshotUrl: string;
  sandboxUrl?: string;
}

interface ConnectionState {
  mode: 'live' | 'snapshot';
  tools: CatalogTool[];
  client?: Client;
  serverName?: string;
  sandboxUrl?: string;
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'grid',
    gridTemplateColumns: 'minmax(260px, 30%) 1fr',
    height: '100%',
    color: '#1f2937',
    background: '#f8fafc',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  sidebar: {
    borderRight: '1px solid #dbe2ea',
    padding: 16,
    overflow: 'auto',
    background: '#fff',
  },
  main: { padding: 24, overflow: 'auto' },
  card: {
    border: '1px solid #dbe2ea',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    background: '#fff',
  },
  code: {
    display: 'block',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    background: '#111827',
    color: '#e5e7eb',
    borderRadius: 6,
    padding: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
  },
  button: {
    border: 0,
    borderRadius: 6,
    padding: '8px 12px',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  muted: { color: '#64748b', fontSize: 13 },
};

function runtimeConfig(): RuntimeConfig {
  return (
    window.__MCP_DEVTOOLS_CONFIG__ ?? {
      brokerPath: BROKER_PATH,
      snapshotUrl: `${BROKER_PATH}/catalog.json`,
    }
  );
}

async function connectLive(config: RuntimeConfig): Promise<ConnectionState> {
  const statusResponse = await fetch(`${config.brokerPath}/status`);
  if (!statusResponse.ok) throw new Error('Live broker is unavailable.');
  const status = (await statusResponse.json()) as {
    mode: 'live' | 'snapshot';
    csrfToken?: string;
    sandboxUrl?: string;
  };
  if (status.mode !== 'live') throw new Error('Live MCP is not configured.');
  if (!status.csrfToken) throw new Error('Live broker did not provide a CSRF token.');

  const client = new Client({ name: 'storybook-mcp-devtools-manager', version: '0.1.0' });
  await client.connect(new BrokerTransport(`${config.brokerPath}/protocol`, status.csrfToken));
  const tools = await listAllTools(async (cursor) => {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    return {
      tools: page.tools,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  });
  return {
    mode: 'live',
    tools,
    client,
    serverName: client.getServerVersion()?.name,
    ...(status.sandboxUrl || config.sandboxUrl
      ? { sandboxUrl: status.sandboxUrl ?? config.sandboxUrl }
      : {}),
  };
}

async function loadSnapshot(config: RuntimeConfig): Promise<ConnectionState> {
  const response = await fetch(config.snapshotUrl);
  if (!response.ok) throw new Error(`Catalog snapshot returned HTTP ${response.status}.`);
  const snapshot = (await response.json()) as CatalogSnapshot;
  return {
    mode: 'snapshot',
    tools: snapshot.tools,
    serverName: snapshot.server.name,
    ...(config.sandboxUrl ? { sandboxUrl: config.sandboxUrl } : {}),
  };
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function ToolMetadata({ tool }: { tool: CatalogTool }) {
  return (
    <>
      <div style={styles.card}>
        <h2 style={{ marginTop: 0 }}>{tool.title ?? tool.annotations?.title ?? tool.name}</h2>
        <div style={styles.muted}>{tool.name}</div>
        <p>{tool.description ?? 'No description supplied.'}</p>
        <strong>Annotations</strong>
        <code style={styles.code}>{pretty(tool.annotations ?? {})}</code>
      </div>
      <div style={styles.card}>
        <strong>Input schema</strong>
        <code style={styles.code}>{pretty(tool.inputSchema)}</code>
      </div>
      {tool.outputSchema ? (
        <div style={styles.card}>
          <strong>Output schema</strong>
          <code style={styles.code}>{pretty(tool.outputSchema)}</code>
        </div>
      ) : null}
      {getToolAppResourceUri(tool) ? (
        <div style={styles.card}>
          <strong>MCP App</strong>
          <code style={styles.code}>
            {pretty({
              resourceUri: getToolAppResourceUri(tool),
              metadata: tool.app ?? null,
            })}
          </code>
        </div>
      ) : null}
    </>
  );
}

function ResultView({ result }: { result: NormalizedToolResult }) {
  return (
    <div style={styles.card}>
      <h3 style={{ marginTop: 0 }}>
        Result {result.isError ? '· error' : '· success'} · {result.elapsedMs.toFixed(1)} ms
      </h3>
      {result.protocolError ? (
        <>
          <strong>Protocol error</strong>
          <code style={styles.code}>{pretty(result.protocolError)}</code>
        </>
      ) : null}
      {result.structuredContent ? (
        <>
          <strong>structuredContent</strong>
          <code style={styles.code}>{pretty(result.structuredContent)}</code>
        </>
      ) : null}
      <strong>Content blocks ({result.content.length})</strong>
      <code style={styles.code}>{pretty(result.content)}</code>
    </div>
  );
}

function AppPreview({
  client,
  sandboxUrl,
  resource,
  tool,
  tools,
  args,
  result,
}: {
  client?: Client;
  sandboxUrl?: string;
  resource?: McpResourceContent;
  tool: CatalogTool;
  tools: CatalogTool[];
  args: Record<string, unknown>;
  result?: CallToolResult;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!client || !sandboxUrl || !resource || !result || !iframeRef.current) return;
    let cleanup: (() => Promise<void>) | undefined;
    let active = true;
    mountMcpApp({
      client,
      iframe: iframeRef.current,
      sandboxUrl,
      resource,
      tool: tool as Tool,
      tools: tools as Tool[],
      args,
      result,
    })
      .then((dispose) => {
        if (active) cleanup = dispose;
        else void dispose();
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
      if (cleanup) void cleanup();
    };
  }, [args, client, resource, result, sandboxUrl, tool, tools]);

  if (!client || !result) return null;
  if (!sandboxUrl) {
    return (
      <div style={styles.card}>
        <strong>App preview unavailable</strong>
        <p style={styles.muted}>
          Configure a separate-origin sandboxUrl. Rendering untrusted app HTML on the Storybook
          origin is intentionally not supported.
        </p>
      </div>
    );
  }
  if (error) return <div style={styles.card}>App preview error: {error}</div>;
  return (
    <div style={styles.card}>
      <h3 style={{ marginTop: 0 }}>MCP App preview</h3>
      <iframe
        ref={iframeRef}
        title={`${tool.name} MCP App`}
        style={{ width: '100%', minHeight: 320, border: '1px solid #cbd5e1', borderRadius: 6 }}
      />
    </div>
  );
}

function DevToolsTab({ api }: { api: API }) {
  const [state, setState] = useState<ConnectionState>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState<string>();
  const [argsText, setArgsText] = useState('{}');
  const [validation, setValidation] = useState<string>();
  const [result, setResult] = useState<NormalizedToolResult>();
  const [rawResult, setRawResult] = useState<CallToolResult>();
  const [runArgs, setRunArgs] = useState<Record<string, unknown>>();
  const [resource, setResource] = useState<McpResourceContent>();
  const [resourceError, setResourceError] = useState<string>();
  const [running, setRunning] = useState(false);
  const clientRef = useRef<Client>();
  const linked = api.getCurrentParameter<StoryMcpParameters | undefined>('mcp');
  const config = useMemo(runtimeConfig, []);

  const refresh = useCallback(async () => {
    setError(undefined);
    setResult(undefined);
    setResource(undefined);
    try {
      let next: ConnectionState;
      try {
        next = await connectLive(config);
      } catch {
        next = await loadSnapshot(config);
      }
      const previousClient = clientRef.current;
      clientRef.current = next.client;
      setState(next);
      if (previousClient && previousClient !== next.client) void previousClient.close();
      setSelectedName((current) =>
        current && next.tools.some((tool) => tool.name === current) ? current : next.tools[0]?.name,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [config]);

  useEffect(() => {
    void refresh();
    return () => {
      void clientRef.current?.close();
    };
  }, [refresh]);

  const selected = state?.tools.find((tool) => tool.name === selectedName);
  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return (
      state?.tools.filter((tool) =>
        [tool.name, tool.title, tool.description].some((value) =>
          value?.toLowerCase().includes(needle),
        ),
      ) ?? []
    );
  }, [query, state]);

  const run = useCallback(async () => {
    if (!selected || !state?.client) return;
    setValidation(undefined);
    let args: Record<string, unknown>;
    try {
      const parsed = JSON.parse(argsText) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Arguments must be a JSON object.');
      }
      args = parsed as Record<string, unknown>;
      const validate = new Ajv({ allErrors: true, strict: false }).compile(selected.inputSchema);
      if (!validate(args)) {
        setValidation(validate.errors?.map((item) => item.message).join(', '));
        return;
      }
    } catch (cause) {
      setValidation(cause instanceof Error ? cause.message : String(cause));
      return;
    }

    setRunning(true);
    setResult(undefined);
    setRawResult(undefined);
    setRunArgs(args);
    setResource(undefined);
    setResourceError(undefined);
    const started = performance.now();
    try {
      const callResult = (await state.client.callTool({
        name: selected.name,
        arguments: args,
      })) as CallToolResult;
      setRawResult(callResult);
      setResult(normalizeToolResult(callResult, performance.now() - started));
      const uri = getToolAppResourceUri(selected);
      if (uri) {
        try {
          const appResource = await state.client.readResource({ uri });
          const content = appResource.contents.find((item) => item.uri === uri);
          if (!content) throw new Error(`resources/read returned no content for ${uri}.`);
          if (content.mimeType !== RESOURCE_MIME_TYPE) {
            throw new Error(`Unsupported MCP App MIME type: ${content.mimeType ?? 'missing'}.`);
          }
          const normalized = content as McpResourceContent;
          setResource(normalized);
          const app = parseAppResource(normalized, uri);
          setState((current) =>
            current
              ? {
                  ...current,
                  tools: current.tools.map((tool) =>
                    tool.name === selected.name ? { ...tool, app } : tool,
                  ),
                }
              : current,
          );
        } catch (cause) {
          setResourceError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    } catch (cause) {
      setResult(normalizeToolResult(undefined, performance.now() - started, cause));
    } finally {
      setRunning(false);
    }
  }, [argsText, selected, state]);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h2>MCP DevTools</h2>
        <p>{error}</p>
        <button type="button" style={styles.button} onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <aside style={styles.sidebar}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <strong>MCP DevTools</strong>
            <div style={styles.muted}>
              {state?.serverName ?? 'Connecting…'} · {state?.mode ?? 'loading'}
            </div>
          </div>
          <button type="button" style={styles.button} onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {linked?.tools?.length ? (
          <p style={styles.muted}>Current story links: {linked.tools.join(', ')}</p>
        ) : null}
        <input
          aria-label="Search MCP tools"
          placeholder="Search tools"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{
            boxSizing: 'border-box',
            width: '100%',
            margin: '16px 0',
            padding: 10,
            border: '1px solid #cbd5e1',
            borderRadius: 6,
          }}
        />
        {filtered.map((tool) => (
          <button
            key={tool.name}
            type="button"
            onClick={() => {
              setSelectedName(tool.name);
              setArgsText('{}');
              setResult(undefined);
              setRawResult(undefined);
              setRunArgs(undefined);
              setResource(undefined);
              setResourceError(undefined);
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: 12,
              marginBottom: 6,
              border: '1px solid',
              borderColor: selectedName === tool.name ? '#2563eb' : '#e2e8f0',
              borderRadius: 6,
              background: selectedName === tool.name ? '#eff6ff' : '#fff',
              cursor: 'pointer',
            }}
          >
            <strong>{tool.title ?? tool.annotations?.title ?? tool.name}</strong>
            <div style={styles.muted}>{tool.name}</div>
          </button>
        ))}
      </aside>
      <main style={styles.main}>
        {selected ? (
          <>
            <ToolMetadata tool={selected} />
            <div style={styles.card}>
              <h3 style={{ marginTop: 0 }}>Run tool</h3>
              <p style={styles.muted}>
                Annotations are untrusted hints. Review the exact JSON below; this addon never
                invokes a tool automatically.
              </p>
              <textarea
                aria-label="Tool arguments JSON"
                value={argsText}
                onChange={(event) => setArgsText(event.target.value)}
                spellCheck={false}
                style={{ ...styles.code, boxSizing: 'border-box', width: '100%', minHeight: 140 }}
              />
              {validation ? <p style={{ color: '#b91c1c' }}>{validation}</p> : null}
              <button
                type="button"
                style={{
                  ...styles.button,
                  marginTop: 12,
                  opacity: state?.mode === 'live' && !running ? 1 : 0.55,
                }}
                disabled={state?.mode !== 'live' || running}
                onClick={() => void run()}
              >
                {running ? 'Calling…' : 'Call tool'}
              </button>
              {state?.mode === 'snapshot' ? (
                <p style={styles.muted}>Live calls are disabled in static snapshot mode.</p>
              ) : null}
            </div>
            {result ? <ResultView result={result} /> : null}
            {resourceError ? (
              <div style={styles.card}>MCP App resource error: {resourceError}</div>
            ) : null}
            {getToolAppResourceUri(selected) ? (
              <AppPreview
                client={state?.client}
                sandboxUrl={state?.sandboxUrl}
                resource={resource}
                tool={selected}
                tools={state?.tools ?? []}
                args={runArgs ?? {}}
                result={rawResult}
              />
            ) : null}
          </>
        ) : (
          <p>No MCP tools found.</p>
        )}
      </main>
    </div>
  );
}

addons.register(ADDON_ID, (api) => {
  addons.add(TAB_ID, {
    type: types.TAB,
    title: 'MCP DevTools',
    route: () => '/mcp-devtools',
    match: ({ viewMode }) => viewMode === 'mcp-devtools',
    render: () => <DevToolsTab api={api} />,
  });
});
