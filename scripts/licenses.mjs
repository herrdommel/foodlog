import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['frontend', 'backend'];

const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'OFL-1.1',
  'Unlicense',
]);

// sharp loads libvips as a separate shared library, which LGPL allows next to AGPL code.
const EXCEPTIONS = [{ license: 'LGPL-3.0-or-later', namePrefix: '@img/sharp-libvips-' }];

const LICENSE_FILE = /^(licen[cs]e|notice|copying)/i;

function list(pkg) {
  const out = execFileSync(
    'pnpm',
    ['--filter', `@foodlog/${pkg}`, 'licenses', 'list', '--prod', '--json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return Object.values(JSON.parse(out)).flat();
}

function expressionAllowed(expression) {
  const terms = expression.replace(/[()]/g, '').trim();
  if (terms.includes(' OR ')) return terms.split(' OR ').some((term) => ALLOWED.has(term.trim()));
  return terms.split(' AND ').every((term) => ALLOWED.has(term.trim()));
}

function check() {
  const problems = [];
  for (const pkg of PACKAGES) {
    for (const entry of list(pkg)) {
      const excepted = EXCEPTIONS.some(
        (rule) => rule.license === entry.license && entry.name.startsWith(rule.namePrefix),
      );
      if (!excepted && !expressionAllowed(entry.license)) {
        problems.push(`${pkg}: ${entry.name} uses ${entry.license}`);
      }
    }
  }
  if (problems.length > 0) {
    console.error(`Licenses outside the allow list:\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('All production dependency licenses are on the allow list.');
}

function notices() {
  const seen = new Map();
  for (const entry of list('frontend')) {
    entry.versions.forEach((version, index) => {
      seen.set(`${entry.name}@${version}`, {
        license: entry.license,
        dir: entry.paths[index] ?? entry.paths[0],
      });
    });
  }
  const sections = [...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, { license, dir }]) => {
      const files = readdirSync(dir).filter((file) => LICENSE_FILE.test(file));
      const texts = files.map((file) => readFileSync(join(dir, file), 'utf8').trim());
      return [`${id} (${license})`, ...texts].join('\n\n');
    });
  const header =
    'Third-party software in the Foodlog I/O web frontend.\n' +
    'Each component keeps its own license, reproduced below.';
  const target = join(root, 'frontend', 'public', 'licenses');
  mkdirSync(target, { recursive: true });
  writeFileSync(
    join(target, 'third-party-notices.txt'),
    `${header}\n\n${sections.join(`\n\n${'-'.repeat(72)}\n\n`)}\n`,
  );
  console.log(`Wrote notices for ${sections.length} packages.`);
}

const command = process.argv[2];
if (command === 'check') check();
else if (command === 'notices') notices();
else {
  console.error('Usage: node scripts/licenses.mjs <check|notices>');
  process.exit(2);
}
