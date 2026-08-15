import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { RsbuildPlugin } from "@rsbuild/core";
import { defineConfig } from "@rslib/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { rspack } from "@rspack/core";
import { tapLib, tapLifecycleTarget } from "@theaiplatform/miniapp-sdk/rspack";

const require = createRequire(import.meta.url);
const reactPackageRoot = dirname(require.resolve("react/package.json"));
const reactDomPackageRoot = dirname(require.resolve("react-dom/package.json"));

const singleReactRuntimePlugin: RsbuildPlugin = {
  name: "gamelord-miniapp:single-react-runtime",
  setup(api) {
    api.modifyBundlerChain((chain) => {
      chain.resolve.alias.set("react", reactPackageRoot).set("react-dom", reactDomPackageRoot);
    });
  },
};

const lifecycleBuild = Boolean(process.env.TAP_MINIAPP_TARGET);
const target = process.env.TAP_MINIAPP_TARGET ?? process.env.TAP_PACKAGE_TARGET ?? "desktop";

if (target !== "desktop") {
  throw new Error(`Unsupported GameLord miniapp target: ${target}`);
}

const library = lifecycleBuild
  ? tapLifecycleTarget()
  : tapLib({
      manifest: "./manifest.tap.json",
      packageTarget: "desktop",
      packageOutputRoot: ".tap-build/desktop",
      federation: {
        name: "gamelord_miniapp_desktop",
        filename: "remoteEntry.mjs",
        manifest: true,
        library: { type: "module" },
        dts: false,
        exposes: {
          "./tap/lifecycle": "./src/lifecycle.ts",
          "./ui/desktop": "./src/surface.tsx",
        },
      },
    });

library.output = {
  ...library.output,
  assetPrefix: "auto",
  sourceMap: false,
  minify: true,
};
library.plugins = [...(library.plugins ?? []), singleReactRuntimePlugin];
library.tools = {
  ...library.tools,
  rspack(config) {
    config.plugins ??= [];
    config.plugins.push(
      new rspack.CopyRspackPlugin({
        patterns: [
          {
            from: "../desktop/resources/homebrew/*.nes",
            to: "targets/desktop/static/roms/[name][ext]",
          },
          {
            from: "assets/nes-audio-worklet.js",
            to: "targets/desktop/static/nes-audio-worklet.js",
          },
        ],
      }),
    );
  },
};

export default defineConfig({
  plugins: [pluginReact()],
  lib: [library],
});
