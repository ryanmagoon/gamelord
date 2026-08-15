import manifest from "./manifest.tap.json" with { type: "json" };
import { defineTapMiniapp } from "@theaiplatform/miniapp-sdk/authoring";
import { commandTargetBuilder } from "@theaiplatform/miniapp-sdk/lifecycle";

const builder = commandTargetBuilder({
  command: "pnpm",
  args: ["run", "build:target"],
});

const manifestContributions = {
  id: "gamelord.manifest-contributions",
  async provide() {
    return {
      contributions: manifest.contributions,
      files: [],
    };
  },
};

export default defineTapMiniapp({
  release: { version: manifest.release.version },
  identity: manifest.package,
  presentation: manifest.presentation,
  compatibility: { tapHost: manifest.compatibility.tapHost },
  targets: {
    desktop: {
      remoteName: manifest.targets.desktop.remoteName,
      exposes: {
        "./tap/lifecycle": {
          source: "./src/lifecycle.ts",
          runtime: "webview",
        },
        "./ui/desktop": {
          source: "./src/surface.tsx",
          runtime: "webview",
        },
      },
      builder,
    },
  },
  contributions: [manifestContributions],
  events: manifest.events,
  lifecycle: manifest.lifecycle,
});
