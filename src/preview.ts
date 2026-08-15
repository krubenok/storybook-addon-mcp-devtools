import type { StoryMcpParameters } from './types.js';

declare module 'storybook/internal/types' {
  interface Parameters {
    mcp?: StoryMcpParameters;
  }
}

export {};
