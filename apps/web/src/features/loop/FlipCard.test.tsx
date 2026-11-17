import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { FlipCard } from './FlipCard';

const face = (side: 'front' | 'back') =>
  document.querySelector(`.flip-card__${side}`) as HTMLElement;

describe('FlipCard', () => {
  it('shows the item on the front with its direction label, and hides hints until Hints', () => {
    render(<FlipCard card={makeCard(1)} side="front" hintsShown={false} onFlip={vi.fn()} />);
    expect(screen.getByText('EN → HE · Words')).toBeInTheDocument();
    expect(screen.queryByTestId('front-hints')).not.toBeInTheDocument();
    expect(face('front')).toHaveAttribute('aria-hidden', 'false');
    expect(face('back')).toHaveAttribute('aria-hidden', 'true');
    expect(face('back')).toHaveAttribute('inert');
  });

  it('shows hints and synonyms on the front after Hints', () => {
    render(
      <FlipCard
        card={makeCard(1, { synonyms: ['a', 'b'] })}
        side="front"
        hintsShown
        onFlip={vi.fn()}
      />,
    );
    const hints = screen.getByTestId('front-hints');
    expect(hints).toHaveTextContent('Hint for sample 1.');
    expect(hints).toHaveTextContent('Synonyms: a, b');
  });

  it('always shows hints on the back, or "Hint is not available"', () => {
    const { rerender } = render(
      <FlipCard card={makeCard(1)} side="back" hintsShown={false} onFlip={vi.fn()} />,
    );
    expect(screen.getByTestId('back-hints')).toHaveTextContent('Hint for sample 1.');
    rerender(
      <FlipCard
        card={makeCard(2, { hints: [] })}
        side="back"
        hintsShown={false}
        onFlip={vi.fn()}
      />,
    );
    expect(screen.getByTestId('back-hints')).toHaveTextContent('Hint is not available');
    expect(face('front')).toHaveAttribute('inert');
  });

  it('renders RTL text with its language on each face', () => {
    render(<FlipCard card={makeCard(3)} side="back" hintsShown={false} onFlip={vi.fn()} />);
    const answer = screen.getByText('מילה-3').closest('ul');
    expect(answer).toHaveAttribute('dir', 'rtl');
    expect(answer).toHaveAttribute('lang', 'he');
    expect(screen.getByText('sample-3')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('Translation')).toBeInTheDocument();
  });

  it('numbers explanation lines when there are two or more', () => {
    const card = makeCard(4, {
      direction: { source: 'en', target: 'en' },
      answer: {
        kind: 'explanation',
        lines: ['First', 'Second'],
        numbered: true,
        lang: 'en',
        dir: 'ltr',
      },
    });
    render(<FlipCard card={card} side="back" hintsShown={false} onFlip={vi.fn()} />);
    expect(screen.getByText('First').closest('ol')).toBeInTheDocument();
    expect(screen.getByText('Explanation')).toBeInTheDocument();
  });

  it('shows the multiple-meanings badge', () => {
    render(
      <FlipCard
        card={makeCard(5, { multipleMeanings: true })}
        side="front"
        hintsShown={false}
        onFlip={vi.fn()}
      />,
    );
    expect(screen.getByText(/Multiple meanings/)).toBeInTheDocument();
  });

  it('flips on click and on Enter; its name is the visible face, the instruction a description', () => {
    const onFlip = vi.fn();
    render(<FlipCard card={makeCard(6)} side="front" hintsShown={false} onFlip={onFlip} />);
    const el = screen.getByRole('button', { name: /sample-6/ });
    expect(el).toHaveAccessibleName(expect.not.stringContaining('מילה-6') as unknown as string);
    expect(el).toHaveAccessibleDescription('Showing the front. Press to flip.');
    fireEvent.click(el);
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(onFlip).toHaveBeenCalledTimes(2);
  });
});
