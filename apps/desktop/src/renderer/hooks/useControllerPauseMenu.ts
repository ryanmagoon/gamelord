import { useRef, useState } from "react";

interface EmulationControl {
  pause: () => Promise<{ success: boolean }>;
  resume: () => Promise<{ success: boolean }>;
}

/** Keep menu visibility and the emulation pause state in sync, including IPC failures. */
export function useControllerPauseMenu(
  isPaused: boolean,
  emulation: EmulationControl,
  onError: (message: string) => void,
) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const transition = useRef(false);
  const ownsPause = useRef(false);
  const open = async () => {
    if (transition.current || menuOpen || settingsOpen) {
      return;
    }
    transition.current = true;
    try {
      if (!isPaused && !(await emulation.pause()).success) {
        throw new Error("The emulator did not pause.");
      }
      ownsPause.current = !isPaused;
      setMenuOpen(true);
    } catch (error) {
      onError(`Could not open game menu: ${String(error)}`);
    } finally {
      transition.current = false;
    }
  };
  const close = async (resumeGame = false) => {
    if (transition.current || !menuOpen) {
      return;
    }
    transition.current = true;
    try {
      if ((ownsPause.current || resumeGame) && !(await emulation.resume()).success) {
        throw new Error("The emulator did not resume.");
      }
      ownsPause.current = false;
      setMenuOpen(false);
    } catch (error) {
      onError(`Could not close game menu: ${String(error)}`);
    } finally {
      transition.current = false;
    }
  };
  const showSettings = () => {
    setMenuOpen(false);
    setSettingsOpen(true);
  };
  const changeSettings = (value: boolean) => {
    setSettingsOpen(value);
    if (!value) {
      setMenuOpen(true);
    }
  };
  return { menuOpen, settingsOpen, open, close, showSettings, changeSettings };
}
