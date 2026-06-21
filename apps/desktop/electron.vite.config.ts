import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { config as loadDotenv } from "dotenv";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import type { Plugin } from "vite";

// Load .env at config time so values are available for build-time injection.
// In CI, these come from GitHub Actions secrets instead.
loadDotenv({ path: resolve(__dirname, ".env") });

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
function sentryPlugins(): Array<Plugin> {
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
          "workers/json-stringify-worker": resolve(
            __dirname,
            "src/main/workers/json-stringify-worker.ts",
          ),
        },
        // `electron` must stay external — it's provided by the runtime. Bundling
        // its npm shim breaks `getElectronPath()` (it reads `path.txt` relative
        // to its own dir). electron-vite's externalize plugin doesn't reliably
        // catch it under rolldown-vite, so list it explicitly.
        external: ["electron", /^electron\/.+/, /\.node$/],
        output: {
          format: "es",
          // electron-vite 5 + Vite 8 emit the main process as ESM (`.mjs`),
          // where `__dirname`/`__filename` don't exist. The main source and
          // bundled CJS deps (e.g. electron's index.js shim) rely on them, so
          // recreate them per-file from `import.meta.url`.
          banner:
            "import { fileURLToPath as __gl_fileURLToPath } from 'node:url';\n" +
            "import { dirname as __gl_dirname } from 'node:path';\n" +
            "const __filename = __gl_fileURLToPath(import.meta.url);\n" +
            "const __dirname = __gl_dirname(__filename);",
        },
      },
    },
    define: {
      "process.env.SCREENSCRAPER_DEV_ID": JSON.stringify(process.env.SCREENSCRAPER_DEV_ID ?? ""),
      "process.env.SCREENSCRAPER_DEV_PASSWORD": JSON.stringify(
        process.env.SCREENSCRAPER_DEV_PASSWORD ?? "",
      ),
      "process.env.SENTRY_DSN": JSON.stringify(process.env.SENTRY_DSN ?? ""),
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
        // Keep `electron` external here too — bundling its shim makes the
        // sandboxed preload throw on load, so `contextBridge` never runs and
        // the renderer never receives `window.gamelord`.
        external: ["electron", /^electron\/.+/, /\.node$/],
        output: {
          // Sandboxed preload scripts must be CommonJS — Electron does not
          // support ESM preloads when `sandbox: true`. Force `.cjs` output so
          // the preload loads and `contextBridge` exposes the renderer API.
          format: "cjs",
          entryFileNames: "[name].cjs",
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
