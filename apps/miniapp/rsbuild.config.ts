import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { rspack } from "@rspack/core";

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: "./src/preview.tsx",
    },
  },
  html: {
    title: "GameLord TAP Miniapp",
  },
  output: {
    distPath: {
      root: "preview-dist",
    },
    sourceMap: false,
  },
  tools: {
    rspack(config) {
      config.plugins ??= [];
      config.plugins.push(
        new rspack.CopyRspackPlugin({
          patterns: [
            {
              from: "../desktop/resources/homebrew/*.nes",
              to: "static/roms/[name][ext]",
            },
            {
              from: "assets/nes-audio-worklet.js",
              to: "static/nes-audio-worklet.js",
            },
          ],
        }),
      );
    },
  },
});
