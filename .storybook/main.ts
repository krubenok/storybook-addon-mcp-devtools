import type { StorybookConfig } from '@storybook/react-vite';

const localAddon = new URL('../dist/preset.js', import.meta.url).pathname;

const config: StorybookConfig = {
  stories: ['../sample/**/*.stories.tsx'],
  addons: [
    '@storybook/addon-docs',
    {
      name: localAddon,
      options: {
        endpoint: 'http://127.0.0.1:6123/mcp',
        sandboxUrl: 'http://127.0.0.1:6124/sandbox.html',
        snapshotUrl: './__mcp-devtools/catalog.json',
      },
    },
  ],
  staticDirs: [{ from: '../sample/snapshots', to: '/__mcp-devtools' }],
  framework: '@storybook/react-vite',
};

export default config;
