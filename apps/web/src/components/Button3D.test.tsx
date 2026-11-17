import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button3D } from './Button3D';

describe('Button3D', () => {
  it('renders a button with the variant class and type="button" by default', () => {
    render(<Button3D variant="know">Know</Button3D>);
    const button = screen.getByRole('button', { name: 'Know' });
    expect(button).toHaveClass('btn3d', 'btn3d--know');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('uses the accent style without a modifier class', () => {
    render(<Button3D>Start</Button3D>);
    expect(screen.getByRole('button', { name: 'Start' }).className).toBe('btn3d');
  });

  it('adds the large size class', () => {
    render(<Button3D size="lg">Start</Button3D>);
    expect(screen.getByRole('button', { name: 'Start' })).toHaveClass('btn3d--lg');
  });

  it('calls onClick when enabled', async () => {
    const onClick = vi.fn();
    render(<Button3D onClick={onClick}>Next</Button3D>);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button3D disabled onClick={onClick}>
        Next
      </Button3D>,
    );
    const button = screen.getByRole('button', { name: 'Next' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
