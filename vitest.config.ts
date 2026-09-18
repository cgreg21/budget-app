import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const fromRoot = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // The data layer only needs `getUserDataDir()` and `uuidStringRandom()`;
      // the stub provides both so the stores run without a GTK runtime.
      'gi:GLib-2.0': fromRoot('./test/helpers/glib-stub.ts'),
      // An in-memory keyring, so the default libsecret loader can be exercised
      // on a machine that has no libsecret. Tests needing a *missing* typelib
      // inject their own loader instead.
      'gi:Secret-1': fromRoot('./test/helpers/secret-stub.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        // Widget code: it needs a live GTK/Adwaita runtime, so it cannot be
        // exercised headlessly. The logic it relies on lives in src/domain
        // and src/data, which are covered in full.
        'src/main.ts',
        'src/app/**',
        'src/ui/widgets.ts',
        'src/ui/views/**',
        'src/ui/dialogs/**',
        // Type-only modules: no runtime code to cover.
        'src/ui/gtk-types.ts',
        'src/ui/types.ts',
      ],
      // Statements, lines and functions are covered in full. The ten branches
      // left out are unreachable defensive fallbacks: `row[0] ?? ''` and
      // friends in domain/csv.ts, the same pattern in remote-storage.ts, and
      // the empty-name check in webdav-provider.ts. They are kept because
      // TypeScript types an index access as possibly undefined even where an
      // earlier length check rules it out.
      thresholds: {
        statements: 100,
        branches: 98,
        functions: 100,
        lines: 100,
      },
    },
  },
})
