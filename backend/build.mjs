import { readFileSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: [
    'src/server.ts',
    'src/db/migrate.ts',
    'src/db/seed.ts',
    'src/cli/create-admin.ts',
    'src/cli/create-invite.ts',
  ],
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  target: 'node26',
  format: 'esm',
  external: Object.keys(pkg.dependencies ?? {}),
  sourcemap: true,
});
