import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { activateLocale } from '../../strings';
import { makeCard } from '../../test/fixtures';
import { FlipCard } from './FlipCard';

const face = (side: 'front' | 'back') =>
  document.querySelector(`.flip-card__${side}`) as HTMLElement;

describe('FlipCard', () => {
  it('shows the item on the front with its direction label, and hides hints until Hints', () => {
    render(<FlipCard card={makeCard(1)} side="front" hintsShown={false} onFlip={vi.fn()} />);
    expect(screen.getByText('EN → HE')).toBeInTheDocument(); // just the direction (D-046)
    expect(screen.queryByTestId('front-hints')).not.toBeInTheDocument();
    expect(face('front')).toHaveAttribute('aria-hidden', 'false');
    expect(face('back')).toHaveAttribute('aria-hidden', 'true');
    expect(face('back')).toHaveAttribute('inert');
  });

  it('labels the answer chip in the active language (D-080)', () => {
    activateLocale('he');
    render(
      <FlipCard
        card={makeCard(1)}
        side="front"
        hintsShown={false}
        onFlip={vi.fn()}
        answer="dontKnow"
      />,
    );
    expect(screen.getByTestId('answer-chip')).toHaveTextContent('נבחר: לא ידעתי');
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
    const answer = screen.getByText('מילה-3').closest('ol');
    expect(answer).toHaveAttribute('dir', 'rtl');
    expect(answer).toHaveAttribute('lang', 'he');
    expect(screen.getByText('sample-3')).toHaveAttribute('dir', 'ltr');
  });

  it('shows the literal translation under the answer, labelled "Literally", in the answer language', () => {
    const base = makeCard(6);
    const card = makeCard(6, { answer: { ...base.answer, literal: ['מילולי-6'] } });
    render(<FlipCard card={card} side="back" hintsShown={false} onFlip={vi.fn()} />);
    expect(screen.getByTestId('literal')).toHaveTextContent('Literallyמילולי-6');
    expect(screen.getByText('מילולי-6').closest('ol')).toHaveAttribute('dir', 'rtl');
  });

  it('with a parallel: Parallel (big), then Meaning, then Literally (muted) (D-024)', () => {
    const base = makeCard(8);
    const card = makeCard(8, {
      answer: { ...base.answer, main: 'parallel', meaning: ['משמעות-8'], literal: ['מילולי-8'] },
    });
    render(<FlipCard card={card} side="back" hintsShown={false} onFlip={vi.fn()} />);
    expect(screen.getAllByText('Parallel')[0]).toBeInTheDocument();
    const meaning = screen.getByTestId('meaning');
    const literal = screen.getByTestId('literal');
    expect(meaning).toHaveTextContent('Meaningמשמעות-8');
    expect(
      meaning.compareDocumentPosition(literal) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(literal).toHaveClass('text-muted');
  });

  it('when the literal is the parallel: "Parallel (also literally)" and no Literally section (D-026)', () => {
    const base = makeCard(11);
    const card = makeCard(11, {
      answer: {
        ...base.answer,
        main: 'parallel',
        meaning: ['משמעות-11'],
        literal: [],
        literalSameAsParallel: true,
      },
    });
    render(<FlipCard card={card} side="back" hintsShown={false} onFlip={vi.fn()} />);
    expect(screen.getByText('Parallel (also literally)')).toBeInTheDocument();
    expect(screen.queryByTestId('literal')).not.toBeInTheDocument();
    expect(screen.getByTestId('meaning')).toHaveTextContent('Meaningמשמעות-11');
  });

  it('without a parallel (e.g. a plain word): the meaning is the main answer, headed "Meaning" (D-025)', () => {
    render(<FlipCard card={makeCard(9)} side="back" hintsShown={false} onFlip={vi.fn()} />);
    expect(screen.getAllByText('Meaning')[0]).toBeInTheDocument();
    expect(screen.queryByText('Parallel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('meaning')).not.toBeInTheDocument();
  });

  it('numbers the entries of a section when there are two or more', () => {
    const base = makeCard(10);
    const card = makeCard(10, { answer: { ...base.answer, lines: ['first', 'second'] } });
    render(<FlipCard card={card} side="back" hintsShown={false} onFlip={vi.fn()} />);
    expect(screen.getByText('first').closest('li')).toHaveTextContent('1.first');
    expect(screen.getByText('second').closest('li')).toHaveTextContent('2.second');
  });

  it('shows no literal line when there is none', () => {
    render(<FlipCard card={makeCard(7)} side="back" hintsShown={false} onFlip={vi.fn()} />);
    expect(screen.queryByTestId('literal')).not.toBeInTheDocument();
  });

  it('numbers explanation lines when there are two or more', () => {
    const card = makeCard(4, {
      direction: { source: 'en', target: 'en' },
      answer: {
        kind: 'explanation',
        main: 'explanation',
        lines: ['First', 'Second'],
        numbered: true,
        meaning: [],
        literal: [],
        literalSameAsParallel: false,
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

  it('has a Flip button on both faces (only the visible one is reachable); a card tap does not flip (D-047)', () => {
    const onFlip = vi.fn();
    const { rerender } = render(
      <FlipCard card={makeCard(6)} side="front" hintsShown={false} onFlip={onFlip} />,
    );
    const flipButtons = () => screen.getAllByRole('button', { name: 'Flip' });
    expect(flipButtons()).toHaveLength(1);
    expect(face('front')).toContainElement(flipButtons()[0] as HTMLElement);
    fireEvent.click(flipButtons()[0] as HTMLElement);
    expect(onFlip).toHaveBeenCalledTimes(1); // the button doesn't also trigger the card tap

    rerender(<FlipCard card={makeCard(6)} side="back" hintsShown={false} onFlip={onFlip} />);
    expect(flipButtons()).toHaveLength(1);
    expect(face('back')).toContainElement(flipButtons()[0] as HTMLElement);
    fireEvent.click(flipButtons()[0] as HTMLElement);
    fireEvent.click(screen.getByTestId('flip-card'));
    expect(onFlip).toHaveBeenCalledTimes(2); // the tap on the card did nothing
  });
});
