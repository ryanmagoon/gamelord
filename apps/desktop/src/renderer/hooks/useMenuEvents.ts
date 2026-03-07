import { useEffect } from "react";
import type { GamelordAPI } from "../types/global";

interface MenuEventHandlers {
  onScanLibrary: () => void;
  onAddRomFolder: () => void;
  onOpenSettings: () => void;
}

/**
 * Subscribes to app menu IPC events (`menu:scanLibrary`, `menu:addRomFolder`,
 * `menu:openSettings`) and calls the corresponding handler. Cleans up
 * listeners on unmount.
 */
export function useMenuEvents(api: GamelordAPI, handlers: MenuEventHandlers): void {
  useEffect(() => {
    api.on("menu:scanLibrary", handlers.onScanLibrary);
    api.on("menu:addRomFolder", handlers.onAddRomFolder);
    api.on("menu:openSettings", handlers.onOpenSettings);

    return () => {
      api.removeAllListeners("menu:scanLibrary");
      api.removeAllListeners("menu:addRomFolder");
      api.removeAllListeners("menu:openSettings");
    };
  }, [api, handlers.onScanLibrary, handlers.onAddRomFolder, handlers.onOpenSettings]);
}
