import type { Meta, StoryObj } from '@storybook/react-vite';

import { Counter } from './Counter';

const meta = {
  title: 'Sample/Counter',
  component: Counter,
  parameters: {
    mcp: {
      tools: ['increment-counter'],
      resourceUri: 'ui://storybook-mcp-devtools/counter',
    },
  },
} satisfies Meta<typeof Counter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AssociatedToolAndApp: Story = {};
