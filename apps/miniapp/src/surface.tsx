import type {
  TapFederatedSurfaceMount,
  TapFederatedSurfaceMountContext,
} from "@theaiplatform/miniapp-sdk/surface";
import { resolvePackageAssetUrl } from "@theaiplatform/miniapp-sdk/surface";
import { installMiniAppAppearanceSync } from "@theaiplatform/miniapp-sdk/web";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createCheckpointCoordinator } from "./checkpoint";
import { createGameLordPersistence } from "./persistence";
import "./styles.css";

export const surfaceTarget = "desktop" as const;

export function mount(
  container: HTMLElement,
  context: TapFederatedSurfaceMountContext,
): TapFederatedSurfaceMount {
  const stopAppearanceSync = installMiniAppAppearanceSync();
  const root = createRoot(container);
  const checkpoints = createCheckpointCoordinator();
  const persistence = createGameLordPersistence({ context });
  root.render(
    <App
      checkpoints={checkpoints}
      persistence={persistence}
      resolveAssetUrl={(path) => resolvePackageAssetUrl(context, path).href}
    />,
  );

  let mounted = true;
  return {
    async unmount() {
      if (!mounted) {
        return;
      }
      mounted = false;
      await checkpoints.checkpoint();
      stopAppearanceSync();
      root.unmount();
    },
  };
}

export default Object.freeze({ mount, surfaceTarget });
