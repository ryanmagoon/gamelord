import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import type { Plugin } from "vite";

function getGitBranch(): string | null {
  try {
    return execSync("git branch --show-current", { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

function getWorktreeInfo(): { name: string; path: string } | null {
  const match = process.cwd().match(/^(.*\/\.claude\/worktrees\/([^/]+))/);
  if (!match) {
    return null;
  }
  return { name: match[2], path: match[1] };
}

const isDev = process.env.NODE_ENV !== "production";
const gitBranch = isDev ? getGitBranch() : null;
const worktreeInfo = isDev ? getWorktreeInfo() : null;

/**
 * Returns the Sentry Vite plugin for source map uploads when auth credentials
 * are available (CI release builds). Returns an empty array otherwise so the
 * spread in plugin lists is a no-op during local development.
 */
function sentryPlugins(): Plugin[] {
  if (!process.env.SENTRY_AUTH_TOKEN) {
    return [];
  }
  return [
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.npm_package_version },
      sourcemaps: {
        filesToDeleteAfterUpload: ["./out/**/*.map"],
      },
    }),
  ];
}

/** Vite plugin that injects dev-time git info as compile-time constants. */
function devGitInfoPlugin(): Plugin {
  const replacements: Record<string, string> = {
    __DEV_GIT_BRANCH__: JSON.stringify(gitBranch),
    __DEV_WORKTREE_NAME__: JSON.stringify(worktreeInfo?.name ?? null),
    __DEV_WORKTREE_PATH__: JSON.stringify(worktreeInfo?.path ?? null),
  };

  return {
    name: "dev-git-info",
    transform(code, id) {
      if (!id.endsWith(".tsx") && !id.endsWith(".ts")) {
        return;
      }
      let result = code;
      for (const [key, value] of Object.entries(replacements)) {
        result = result.replaceAll(key, value);
      }
      if (result !== code) {
        return { code: result, map: null };
      }
    },
  };
}

export default defineConfig({
  main: {
    build: {
      sourcemap: process.env.SENTRY_AUTH_TOKEN ? "hidden" : undefined,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main.ts"),
          "workers/core-worker": resolve(__dirname, "src/main/workers/core-worker.ts"),
        },
        external: [/\.node$/],
      },
    },
    plugins: [externalizeDepsPlugin(), ...sentryPlugins()],
  },
  preload: {
    build: {
      sourcemap: process.env.SENTRY_AUTH_TOKEN ? "hidden" : undefined,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload.ts"),
        },
      },
    },
    plugins: [externalizeDepsPlugin(), ...sentryPlugins()],
  },
  renderer: {
    build: {
      sourcemap: process.env.SENTRY_AUTH_TOKEN ? "hidden" : undefined,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
          "game-window": resolve(__dirname, "game-window.html"),
        },
      },
    },
    optimizeDeps: {
      exclude: ["@gamelord/ui"],
    },
    plugins: [react(), devGitInfoPlugin(), ...sentryPlugins()],
    resolve: {
      // Ensure pnpm workspace symlinks (e.g. @gamelord/ui → packages/ui)
      // resolve to their real paths, so Node module resolution walks up from
      // the real package directory to the root node_modules where pnpm
      // installs transitive dependencies.
      preserveSymlinks: false,
    },
    root: ".",
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
  },
});
