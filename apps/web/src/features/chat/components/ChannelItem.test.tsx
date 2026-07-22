import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChannelItem } from './ChannelItem';
import type { ChannelWithLatest } from '../types';

const base: ChannelWithLatest = {
  id: 'ch-1',
  workspaceId: 'ws-1',
  scope: 'WORKSPACE',
  taskId: null,
  name: 'general',
  description: null,
  isPrivate: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  latestMessage: null,
};

describe('ChannelItem', () => {
  it('renders public channel with hash', () => {
    render(<ChannelItem channel={base} active={false} onClick={vi.fn()} />);
    expect(screen.getByText(/#\s*general/)).toBeInTheDocument();
  });

  it('renders private channel with lock marker', () => {
    render(
      <ChannelItem
        channel={{ ...base, name: 'secret', isPrivate: true }}
        active
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/secret/)).toBeInTheDocument();
    expect(screen.getByRole('button', { current: 'page' }).textContent).toMatch(/🔒/);
  });
});
