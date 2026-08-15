export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type JsonSchema = Record<string, unknown>;

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  [key: string]: unknown;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
}

export interface AppResourceMetadata {
  uri: string;
  mimeType?: string;
  name?: string;
  description?: string;
  csp?: McpUiResourceCsp;
  permissions?: McpUiPermissions;
}

export interface McpUiResourceCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

export interface McpUiPermissions {
  camera?: Record<string, never>;
  microphone?: Record<string, never>;
  geolocation?: Record<string, never>;
  clipboardWrite?: Record<string, never>;
}

export interface CatalogTool extends McpTool {
  app?: AppResourceMetadata;
}

export interface McpServerIdentity {
  name: string;
  version: string;
  protocolVersion?: string;
}

export interface CatalogSnapshot {
  snapshotVersion: 1;
  capturedAt: string;
  server: McpServerIdentity;
  capabilities: Record<string, unknown>;
  tools: CatalogTool[];
}

export interface ToolPage {
  tools: McpTool[];
  nextCursor?: string;
}

export interface McpCatalogAdapter {
  getServerIdentity(): McpServerIdentity;
  getCapabilities(): Record<string, unknown>;
  listTools(cursor?: string): Promise<ToolPage>;
  readResource(uri: string): Promise<McpResourceResult>;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  _meta?: Record<string, unknown>;
}

export interface McpResourceResult {
  contents: McpResourceContent[];
}

export interface McpContentBlock {
  type: string;
  [key: string]: unknown;
}

export interface McpToolResult {
  content?: McpContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export interface NormalizedToolResult {
  content: McpContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError: boolean;
  elapsedMs: number;
  protocolError?: {
    code?: number;
    message: string;
    data?: unknown;
  };
}

export interface StoryMcpParameters {
  tools?: string[];
  resourceUri?: string;
}

export interface AddonOptions {
  endpoint?: string;
  headers?: Record<string, string>;
  snapshotUrl?: string;
  brokerPath?: string;
  sandboxUrl?: string;
}
