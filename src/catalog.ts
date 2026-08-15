import { RESOURCE_MIME_TYPE, SNAPSHOT_VERSION } from './constants.js';
import type {
  AppResourceMetadata,
  CatalogSnapshot,
  CatalogTool,
  McpCatalogAdapter,
  McpResourceContent,
  McpTool,
} from './types.js';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function getToolAppResourceUri(tool: Pick<McpTool, '_meta'>): string | undefined {
  const meta = asRecord(tool._meta);
  const ui = asRecord(meta?.ui);
  const nested = ui?.resourceUri;
  if (typeof nested === 'string') return nested;
  const deprecated = meta?.['ui/resourceUri'];
  return typeof deprecated === 'string' ? deprecated : undefined;
}

export function parseAppResource(
  content: McpResourceContent,
  fallbackUri: string,
): AppResourceMetadata {
  const meta = asRecord(content._meta);
  const ui = asRecord(meta?.ui);
  return {
    uri: content.uri || fallbackUri,
    ...(content.mimeType ? { mimeType: content.mimeType } : {}),
    ...(typeof ui?.name === 'string' ? { name: ui.name } : {}),
    ...(typeof ui?.description === 'string' ? { description: ui.description } : {}),
    ...(asRecord(ui?.csp) ? { csp: asRecord(ui?.csp) as AppResourceMetadata['csp'] } : {}),
    ...(asRecord(ui?.permissions)
      ? { permissions: asRecord(ui?.permissions) as AppResourceMetadata['permissions'] }
      : {}),
  };
}

export async function listAllTools(
  listPage: (cursor?: string) => Promise<{ tools: McpTool[]; nextCursor?: string }>,
): Promise<McpTool[]> {
  const tools: McpTool[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  do {
    if (cursor && seen.has(cursor)) throw new Error(`tools/list repeated cursor "${cursor}".`);
    if (cursor) seen.add(cursor);
    const page = await listPage(cursor);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);

  return tools;
}

export async function captureCatalogSnapshot(
  adapter: McpCatalogAdapter,
  capturedAt = new Date().toISOString(),
): Promise<CatalogSnapshot> {
  const tools = await listAllTools((cursor) => adapter.listTools(cursor));
  const enriched: CatalogTool[] = await Promise.all(
    tools.map(async (tool) => {
      const uri = getToolAppResourceUri(tool);
      if (!uri) return tool;
      const resource = await adapter.readResource(uri);
      const content = resource.contents.find((item) => item.uri === uri) ?? resource.contents[0];
      if (!content) throw new Error(`resources/read returned no content for ${uri}.`);
      const app = parseAppResource(content, uri);
      if (app.mimeType !== RESOURCE_MIME_TYPE) {
        throw new Error(`MCP App ${uri} has unsupported MIME type "${app.mimeType ?? 'missing'}".`);
      }
      return { ...tool, app };
    }),
  );

  return {
    snapshotVersion: SNAPSHOT_VERSION,
    capturedAt,
    server: adapter.getServerIdentity(),
    capabilities: adapter.getCapabilities(),
    tools: enriched,
  };
}
