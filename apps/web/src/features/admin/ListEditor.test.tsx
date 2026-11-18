import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast';
import { ListEditor } from './ListEditor';

// Synthetic entries only.
function Harness({ initial, save }: { initial: string[]; save?: (next: string[]) => boolean }) {
  const [entries, setEntries] = useState(initial);
  return (
    <ListEditor
      label="Hints"
      entries={entries}
      lang="en"
      dir="ltr"
      maxEntries={3}
      maxLength={50}
      onSave={async (next) => {
        const ok = save ? save(next) : true;
        if (ok) setEntries(next);
        return ok;
      }}
    />
  );
}

function setup(initial: string[], save?: (next: string[]) => boolean) {
  const spy = vi.fn(save ?? (() => true));
  render(
    <ToastProvider>
      <Harness initial={initial} save={spy} />
    </ToastProvider>,
  );
  return spy;
}

const items = () =>
  within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('ListEditor (FR-A12)', () => {
  it('adds an entry with Enter and clears the input', async () => {
    const save = setup(['alpha']);
    const input = screen.getByLabelText('Add to hints and press Enter');
    fireEvent.change(input, { target: { value: '  beta  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(save).toHaveBeenCalledWith(['alpha', 'beta']));
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('edits in place: Enter saves, Escape cancels', async () => {
    const save = setup(['alpha', 'beta']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit “alpha”' }));
    const editor = screen.getByRole('textbox', { name: 'Edit “alpha”' });
    fireEvent.change(editor, { target: { value: 'gamma' } });
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit “alpha”' }));
    const again = screen.getByRole('textbox', { name: 'Edit “alpha”' });
    fireEvent.change(again, { target: { value: 'gamma' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    await waitFor(() => expect(save).toHaveBeenCalledWith(['gamma', 'beta']));
  });

  it('edits in place with the Save and Cancel buttons; clicking away keeps the edit', async () => {
    const save = setup(['alpha', 'beta']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit “alpha”' }));
    const editor = screen.getByRole('textbox', { name: 'Edit “alpha”' });
    fireEvent.change(editor, { target: { value: 'gamma' } });
    fireEvent.blur(editor);
    expect(screen.getByRole('textbox', { name: 'Edit “alpha”' })).toHaveValue('gamma');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Edit “alpha”' })).toBeNull();
    expect(save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit “alpha”' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit “alpha”' }), {
      target: { value: 'delta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(['delta', 'beta']));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
  });

  it('deletes at once and Undo re-adds the entry at its place', async () => {
    const save = setup(['alpha', 'beta', 'gamma']);
    fireEvent.click(screen.getByRole('button', { name: 'Delete “beta”' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(['alpha', 'gamma']));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(['alpha', 'beta', 'gamma']));
    await waitFor(() => expect(items()).toHaveLength(3));
  });

  it('reorders with the ↑/↓ buttons', async () => {
    const save = setup(['alpha', 'beta']);
    expect(screen.getByRole('button', { name: 'Move “alpha” up' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move “alpha” down' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(['beta', 'alpha']));
  });

  it('keeps the list and the typed text when a save fails', async () => {
    const save = setup(['alpha'], () => false);
    const input = screen.getByLabelText('Add to hints and press Enter');
    fireEvent.change(input, { target: { value: 'beta' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(input).toHaveValue('beta');
    expect(items()).toHaveLength(1);
  });

  it('stops adding at the maximum', () => {
    setup(['a', 'b', 'c']);
    expect(screen.queryByLabelText('Add to hints and press Enter')).toBeNull();
    expect(screen.getByText('At most 3 entries')).toBeVisible();
  });
});
