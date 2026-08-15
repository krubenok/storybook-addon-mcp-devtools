import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: ['dist/**', 'storybook-static/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    singleQuote: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
  pack: [
    {
      name: 'browser',
      entry: {
        index: 'src/index.ts',
        manager: 'src/manager.tsx',
        preview: 'src/preview.ts',
        catalog: 'src/catalog.ts',
      },
      dts: true,
      format: 'esm',
      platform: 'neutral',
      outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
      sourcemap: true,
      clean: true,
      deps: {
        onlyBundle: false,
        neverBundle: [
          'react',
          'react-dom',
          'react/jsx-runtime',
          'react/jsx-dev-runtime',
          'storybook',
          'storybook/manager-api',
          'storybook/preview-api',
          'storybook/internal/types',
        ],
      },
    },
    {
      name: 'node',
      entry: {
        preset: 'src/preset.ts',
        'cli/snapshot': 'src/cli/snapshot.ts',
      },
      dts: true,
      format: 'esm',
      platform: 'node',
      outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
      sourcemap: true,
      clean: false,
      deps: {
        onlyBundle: false,
        neverBundle: ['storybook', 'storybook/internal/types'],
      },
    },
  ],
});
