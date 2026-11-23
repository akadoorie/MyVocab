import { describe, expect, it } from 'vitest';
import { renderLicenses } from './third-party-licenses-render';

describe('the third-party licenses file', () => {
  const packages = [
    {
      name: 'zeta',
      version: '2.0.0',
      license: 'MIT',
      text: 'MIT License\r\n\r\nCopyright (c) Zeta  ',
    },
    {
      name: 'alpha',
      version: '1.0.0',
      license: 'Apache-2.0',
      homepage: 'https://alpha.example',
      text: null,
    },
  ];

  it('lists every package, sorted by name, then each one with its licence text', () => {
    const out = renderLicenses(packages);
    expect(out).toContain('2 packages:\n  alpha 1.0.0 (Apache-2.0)\n  zeta 2.0.0 (MIT)');
    expect(out.indexOf('alpha 1.0.0\nLicence')).toBeLessThan(out.indexOf('zeta 2.0.0\nLicence'));
    expect(out).toContain('Home page: https://alpha.example');
  });

  it('keeps the shipped text (normalised line endings) and points to the licence when there is none', () => {
    const out = renderLicenses(packages);
    expect(out).toContain('MIT License\n\nCopyright (c) Zeta\n');
    expect(out).not.toContain('\r');
    expect(out).toContain(
      'ships no licence file. It is licensed under Apache-2.0; the licence text: https://www.apache.org/licenses/LICENSE-2.0.',
    );
  });

  it('is the same whatever order the packages come in', () => {
    expect(renderLicenses([...packages].reverse())).toBe(renderLicenses(packages));
  });
});
