/**
 * Renders the third-party licenses file served with the site (/third-party-licenses.txt): every
 * package the app ships with (production dependencies of the web app and the API), with its
 * version, licence, home page and licence text. Pure, so it can be tested.
 */

export type LicensedPackage = {
  name: string;
  version: string;
  license: string;
  homepage?: string;
  /** The package's own licence (and NOTICE) text, or null when the package ships none. */
  text: string | null;
};

/** Where to read a licence when a package doesn't ship its text. */
const LICENSE_URLS: Record<string, string> = {
  'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
  MIT: 'https://opensource.org/license/mit',
  'OFL-1.1': 'https://openfontlicense.org/open-font-license-official-text/',
};

const RULE = '-'.repeat(78);

export function renderLicenses(packages: LicensedPackage[]): string {
  const sorted = [...packages].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
  const lines = [
    'MyVocab: third-party licenses',
    '',
    'MyVocab is built with the open-source packages below. Each is used under its own licence,',
    'reproduced here as its authors ship it.',
    '',
    `${sorted.length} packages:`,
    ...sorted.map((p) => `  ${p.name} ${p.version} (${p.license})`),
    '',
  ];
  for (const p of sorted) {
    lines.push(RULE, `${p.name} ${p.version}`, `Licence: ${p.license}`);
    if (p.homepage) lines.push(`Home page: ${p.homepage}`);
    lines.push('');
    if (p.text) lines.push(p.text.replace(/\r\n?/g, '\n').trim());
    else
      lines.push(
        `This package ships no licence file. It is licensed under ${p.license}` +
          (LICENSE_URLS[p.license] ? `; the licence text: ${LICENSE_URLS[p.license]}` : '') +
          '.',
      );
    lines.push('');
  }
  return lines.join('\n').replace(/[ \t]+$/gm, '') + '\n';
}
