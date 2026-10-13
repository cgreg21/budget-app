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
      // `ui/theme.ts` only asks the default style manager for a colour scheme;
      // the stub records it so the theme mapping can be checked headlessly.
      'gi:Adw-1': fromRoot('./test/helpers/adw-stub.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Deterministic language for the whole suite; individual tests override
    // it to exercise the other locale (see test/ui/format.test.ts).
    env: {
      BUDGET_APP_LOCALE: 'fr',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        // Widget code: it needs a live GTK/Adwaita runtime, so it cannot be
        // exercised headlessly. The logic it relies on         lives in budget-lib
                // and src/data.
        'src/main.ts',
        'src/app/**',
        'src/ui/widgets.ts',
        'src/ui/views/**',
        'src/ui/dialogs/**',
        // Type-only modules: no runtime code to cover.
        'src/ui/gtk-types.ts',
        'src/ui/types.ts',
        // Translation tables: every entry is data, not logic. `i18n/locale.ts`
        // (the one piece of actual behaviour) is covered in full instead.
        'src/i18n/strings.ts',
      ],
      // Statements, lines and functions are covered in full; defensive
      // fallbacks account for the remaining branches.
      thresholds: {
        statements: 100,
        branches: 98,
        functions: 100,
        lines: 100,
      },
    },
  },
})
