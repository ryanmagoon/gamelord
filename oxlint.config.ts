import nkzw from '@nkzw/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [nkzw],
  env: {
    browser: true,
    node: true,
    es2024: true,
  },
  rules: {
    // --- Deferred: adopt incrementally after migration ---
    // Sorting enforcement is too disruptive to adopt all at once.
    'perfectionist/sort-objects': 'off',
    'perfectionist/sort-jsx-props': 'off',
    'perfectionist/sort-object-types': 'off',
    'perfectionist/sort-interfaces': 'off',

    // Virtualization grid and custom hooks read refs during render
    // by design. Needs refactoring to satisfy the React 19 compiler.
    'react-hooks-js/refs': 'off',

    // Many effects intentionally omit deps (audio scheduling, IPC
    // listeners). Fixing requires useEffectEvent or ref-based patterns.
    'react-hooks-js/set-state-in-effect': 'off',
    'react-hooks-js/purity': 'off',
    'react-hooks-js/immutability': 'off',

    // Many effects intentionally omit deps (audio scheduling, IPC
    // listeners, cleanup refs). Fixing properly requires useEffectEvent.
    'eslint-plugin-react-hooks/exhaustive-deps': 'off',

    // Several helper functions are defined inside components for
    // closure access. Extracting them requires refactoring.
    'eslint-plugin-unicorn/consistent-function-scoping': 'off',

    // --- Permanently off for this codebase ---
    // Native addon and IPC code uses `any` for untyped boundaries.
    '@typescript-eslint/no-explicit-any': 'off',

    // Main process uses electron-log, but utility files use console.
    'eslint/no-console': 'off',

    // Electron main process and PostCSS configs use require().
    '@typescript-eslint/no-require-imports': 'off',

    // import * as X is common in this codebase (e.g., path, fs).
    'eslint-plugin-import/no-namespace': 'off',

    // instanceof is used for typed array checks in the WebGL renderer
    // and other legitimate type narrowing. The no-instanceof philosophy
    // doesn't apply to built-in types.
    '@nkzw/no-instanceof': 'off',
  },
});
