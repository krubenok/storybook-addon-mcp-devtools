import type { McpToolResult, NormalizedToolResult } from './types.js';

function protocolError(error: unknown): NormalizedToolResult['protocolError'] {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: number; data?: unknown };
    return {
      message: candidate.message,
      ...(typeof candidate.code === 'number' ? { code: candidate.code } : {}),
      ...(candidate.data !== undefined ? { data: candidate.data } : {}),
    };
  }
  return { message: String(error) };
}

export function normalizeToolResult(
  result: McpToolResult | undefined,
  elapsedMs: number,
  error?: unknown,
): NormalizedToolResult {
  if (error !== undefined) {
    return {
      content: [],
      isError: true,
      elapsedMs,
      protocolError: protocolError(error),
    };
  }
  return {
    content: result?.content ?? [],
    ...(result?.structuredContent ? { structuredContent: result.structuredContent } : {}),
    isError: result?.isError === true,
    elapsedMs,
  };
}
