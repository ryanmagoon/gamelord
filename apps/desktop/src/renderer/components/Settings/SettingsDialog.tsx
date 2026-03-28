import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  SHADER_LABELS,
  SHADER_PRESETS,
  ControllerConfig,
  detectHdrCapabilities,
} from "@gamelord/ui";
import {
  Settings,
  Gamepad2,
  FolderOpen,
  Info,
  SunMoon,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  ExternalLink,
  Check,
  FolderSearch,
  Joystick,
  RefreshCw,
} from "lucide-react";
import { useSfx } from "../../hooks/useSfx";
import { useControllerConfig } from "../../hooks/useControllerConfig";
import type { GamelordAPI } from "../../types/global";
import type { GameSystem } from "../../../types/library";

type ThemeMode = "system" | "dark" | "light";

type SettingsTab = "general" | "emulation" | "controllers" | "library" | "about";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

const TAB_CONFIG: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
  { id: "general", label: "General", icon: <Settings className="h-4 w-4" /> },
  { id: "emulation", label: "Emulation", icon: <Gamepad2 className="h-4 w-4" /> },
  { id: "controllers", label: "Controllers", icon: <Joystick className="h-4 w-4" /> },
  { id: "library", label: "Library", icon: <FolderOpen className="h-4 w-4" /> },
  { id: "about", label: "About", icon: <Info className="h-4 w-4" /> },
];

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
  themeMode,
  onThemeChange,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const { play: playSfx } = useSfx();

  const handleTabChange = (tab: SettingsTab) => {
    playSfx("click");
    setActiveTab(tab);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden" hideCloseButton>
        <div className="flex h-[480px]">
          {/* Sidebar */}
          <nav className="w-44 shrink-0 border-r bg-muted/30 p-3 flex flex-col gap-1">
            <DialogTitle className="px-2 pb-2 text-sm font-semibold text-muted-foreground">
              Settings
            </DialogTitle>
            {TAB_CONFIG.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                  activeTab === tab.id
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "general" && (
              <GeneralTab themeMode={themeMode} onThemeChange={onThemeChange} />
            )}
            {activeTab === "emulation" && <EmulationTab />}
            {activeTab === "controllers" && <ControllersTab />}
            {activeTab === "library" && <LibraryTab />}
            {activeTab === "about" && <AboutTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Section heading within a settings tab. */
const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm font-semibold text-foreground mb-3">{children}</h3>
);

/** Row for a single setting: label on the left, control on the right. */
const SettingRow: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-2">
    <div className="flex-1 min-w-0 pr-4">
      <div className="text-sm font-medium">{label}</div>
      {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

/** Toggle switch styled as a button. */
const Toggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  "aria-label"?: string;
}> = ({ checked, onChange, ...props }) => (
  <button
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
      checked ? "bg-primary" : "bg-muted",
    )}
    {...props}
  >
    <span
      className={cn(
        "inline-block h-4 w-4 rounded-full bg-background transition-transform",
        checked ? "translate-x-6" : "translate-x-1",
      )}
    />
  </button>
);

// ---------------------------------------------------------------------------
// General Tab
// ---------------------------------------------------------------------------

const GeneralTab: React.FC<{
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}> = ({ themeMode, onThemeChange }) => {
  const { preferences, setEnabled, setVolume, play } = useSfx();

  const handleThemeChange = (value: string) => {
    play("click");
    onThemeChange(value as ThemeMode);
  };

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Appearance</SectionHeading>
        <SettingRow label="Theme" description="Choose light, dark, or match your system">
          <Select value={themeMode} onValueChange={handleThemeChange}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">
                <span className="flex items-center gap-1.5">
                  <SunMoon className="h-3.5 w-3.5" />
                  System
                </span>
              </SelectItem>
              <SelectItem value="light">
                <span className="flex items-center gap-1.5">
                  <Sun className="h-3.5 w-3.5" />
                  Light
                </span>
              </SelectItem>
              <SelectItem value="dark">
                <span className="flex items-center gap-1.5">
                  <Moon className="h-3.5 w-3.5" />
                  Dark
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>

      <div>
        <SectionHeading>Sound Effects</SectionHeading>
        <SettingRow
          label="UI sounds"
          description="Play retro sounds for clicks, toggles, and actions"
        >
          <Toggle
            checked={preferences.enabled}
            onChange={(v) => {
              setEnabled(v);
              if (v) {
                play("toggleOn");
              }
            }}
            aria-label="Toggle sound effects"
          />
        </SettingRow>
        {preferences.enabled && (
          <SettingRow label="Volume">
            <div className="flex items-center gap-2">
              <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={preferences.volume}
                onChange={(e) => setVolume(Number.parseFloat(e.target.value))}
                className="w-24 accent-primary"
                aria-label="Sound effects volume"
              />
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </SettingRow>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Controllers Tab
// ---------------------------------------------------------------------------

const ControllersTab: React.FC = () => {
  const {
    controllers,
    mapping,
    selectedControllerIndex,
    selectController,
    buttonStates,
    axisValues,
    remappingButton,
    startRemap,
    cancelRemap,
    changeBinding,
    resetDefaults,
  } = useControllerConfig();

  return (
    <ControllerConfig
      controllers={controllers}
      mapping={mapping}
      onBindingChange={changeBinding}
      onResetDefaults={resetDefaults}
      selectedControllerIndex={selectedControllerIndex}
      onSelectController={selectController}
      buttonStates={buttonStates}
      axisValues={axisValues}
      remappingButton={remappingButton}
      onStartRemap={startRemap}
      onCancelRemap={cancelRemap}
    />
  );
};

// ---------------------------------------------------------------------------
// Emulation Tab
// ---------------------------------------------------------------------------

const FAST_FORWARD_SPEEDS = [1.5, 2, 3, 4, 6, 8];

const EmulationTab: React.FC = () => {
  const api = (window as unknown as { gamelord: GamelordAPI }).gamelord;
  const { play: playSfx } = useSfx();

  const [showFps, setShowFps] = useState(() => {
    return localStorage.getItem("gamelord:showFps") === "true";
  });

  const [fastForwardSpeed, setFastForwardSpeed] = useState(() => {
    const saved = localStorage.getItem("gamelord:fastForwardSpeed");
    return saved !== null ? Number.parseFloat(saved) : 2;
  });

  const [fastForwardAudio, setFastForwardAudio] = useState(() => {
    return localStorage.getItem("gamelord:fastForwardAudio") === "true";
  });

  const [defaultShader, setDefaultShader] = useState(() => {
    return localStorage.getItem("gamelord:shader") ?? "default";
  });

  const [hdrMode, setHdrMode] = useState(() => {
    return localStorage.getItem("gamelord:hdrMode") ?? "auto";
  });

  const [hdrCaps] = useState(() => detectHdrCapabilities());

  const handleShowFpsChange = (checked: boolean) => {
    setShowFps(checked);
    localStorage.setItem("gamelord:showFps", String(checked));
    playSfx(checked ? "toggleOn" : "toggleOff");
  };

  const handleFastForwardAudioChange = (checked: boolean) => {
    setFastForwardAudio(checked);
    localStorage.setItem("gamelord:fastForwardAudio", String(checked));
    api.emulation.setFastForwardAudio(checked);
    playSfx(checked ? "toggleOn" : "toggleOff");
  };

  const handleFastForwardSpeedChange = (value: string) => {
    const speed = Number.parseFloat(value);
    setFastForwardSpeed(speed);
    localStorage.setItem("gamelord:fastForwardSpeed", String(speed));
    playSfx("click");
  };

  const handleDefaultShaderChange = (value: string) => {
    setDefaultShader(value);
    localStorage.setItem("gamelord:shader", value);
    playSfx("click");
  };

  const handleHdrModeChange = (value: string) => {
    setHdrMode(value);
    localStorage.setItem("gamelord:hdrMode", value);
    playSfx("click");
  };

  const hdrSupported = hdrCaps.hdrDisplay && hdrCaps.p3Gamut;

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Display</SectionHeading>
        <SettingRow label="FPS counter" description="Show frame rate overlay during gameplay">
          <Toggle
            checked={showFps}
            onChange={handleShowFpsChange}
            aria-label="Toggle FPS counter"
          />
        </SettingRow>
        <SettingRow label="Default shader" description="Applied when launching a game">
          <Select value={defaultShader} onValueChange={handleDefaultShaderChange}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHADER_PRESETS.map((presetId: string) => (
                <SelectItem key={presetId} value={presetId}>
                  {SHADER_LABELS[presetId] ?? presetId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          label="HDR output"
          description="Wide gamut color and extended brightness on HDR displays"
        >
          <Select value={hdrMode} onValueChange={handleHdrModeChange}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="on">On</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <div className="text-xs text-muted-foreground mt-1">
          {hdrSupported ? "HDR: Supported on this display" : "HDR: Not available on this display"}
        </div>
      </div>

      <div>
        <SectionHeading>Speed</SectionHeading>
        <SettingRow
          label="Fast-forward speed"
          description="Multiplier when fast-forward is active (Tab key)"
        >
          <Select value={String(fastForwardSpeed)} onValueChange={handleFastForwardSpeedChange}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FAST_FORWARD_SPEEDS.map((speed) => (
                <SelectItem key={speed} value={String(speed)}>
                  {speed}x
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          label="Audio while fast-forwarding"
          description="Play game audio at accelerated speed during fast-forward"
        >
          <Toggle
            checked={fastForwardAudio}
            onChange={handleFastForwardAudioChange}
            aria-label="Toggle audio during fast-forward"
          />
        </SettingRow>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Library Tab
// ---------------------------------------------------------------------------

const LibraryTab: React.FC = () => {
  const api = (window as unknown as { gamelord: GamelordAPI }).gamelord;
  const { play: playSfx } = useSfx();

  const [romsBasePath, setRomsBasePath] = useState<string>("");
  const [systems, setSystems] = useState<Array<GameSystem>>([]);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [credentialUserId, setCredentialUserId] = useState("");
  const [credentialPassword, setCredentialPassword] = useState("");
  const [credentialError, setCredentialError] = useState("");
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [credentialSuccess, setCredentialSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [config, creds] = await Promise.all([
        api.library.getConfig(),
        api.artwork.getCredentials(),
      ]);
      setRomsBasePath(config.romsBasePath ?? "");
      setSystems(config.systems ?? []);
      setHasCredentials(creds.hasCredentials);
    };
    load();
  }, [api]);

  const handleChangeBasePath = async () => {
    playSfx("click");
    const selected = await api.dialog.selectDirectory();
    if (selected) {
      await api.library.setRomsBasePath(selected);
      setRomsBasePath(selected);
      playSfx("confirm");
    }
  };

  const handleAddRomFolder = async () => {
    playSfx("click");
    const selected = await api.dialog.selectDirectory();
    if (selected) {
      await api.library.scanDirectory(selected);
      playSfx("confirm");
    }
  };

  const handleSaveCredentials = async () => {
    if (!credentialUserId.trim() || !credentialPassword.trim()) {
      setCredentialError("Both User ID and Password are required");
      return;
    }
    setCredentialSaving(true);
    setCredentialError("");
    setCredentialSuccess(false);
    try {
      const result = await api.artwork.setCredentials(
        credentialUserId.trim(),
        credentialPassword.trim(),
      );
      if (result.success) {
        setHasCredentials(true);
        setCredentialSuccess(true);
        setCredentialUserId("");
        setCredentialPassword("");
        playSfx("syncComplete");
        setTimeout(() => setCredentialSuccess(false), 3000);
      } else {
        setCredentialError(result.error ?? "Validation failed");
        playSfx("error");
      }
    } catch {
      setCredentialError("Failed to save credentials");
      playSfx("error");
    } finally {
      setCredentialSaving(false);
    }
  };

  const handleClearCredentials = async () => {
    await api.artwork.clearCredentials();
    setHasCredentials(false);
    setCredentialSuccess(false);
    playSfx("confirm");
  };

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>ROM Directories</SectionHeading>
        <SettingRow label="Base ROM path" description="Root folder for system subfolders">
          <Button
            variant="outline"
            size="sm"
            onClick={handleChangeBasePath}
            className="h-8 text-xs gap-1.5"
          >
            <FolderSearch className="h-3.5 w-3.5" />
            {romsBasePath ? "Change" : "Set"}
          </Button>
        </SettingRow>
        {romsBasePath && (
          <div
            className="text-xs text-muted-foreground px-0 pb-2 font-mono truncate"
            title={romsBasePath}
          >
            {romsBasePath}
          </div>
        )}
        <SettingRow label="Scan additional folder" description="Add ROMs from any directory">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddRomFolder}
            className="h-8 text-xs gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Folder
          </Button>
        </SettingRow>
        {systems.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-muted-foreground mb-1.5">Configured systems</div>
            <div className="flex flex-wrap gap-1">
              {systems.map((sys) => (
                <span
                  key={sys.id}
                  className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {sys.shortName}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <SectionHeading>ScreenScraper</SectionHeading>
        <p className="text-xs text-muted-foreground mb-3">
          Credentials for downloading cover art and metadata. Free account at screenscraper.fr.
        </p>
        {hasCredentials ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">Credentials saved</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCredentials}
              className="h-8 text-xs gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              placeholder="User ID"
              value={credentialUserId}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCredentialUserId(e.target.value)
              }
              className="h-8 text-xs"
            />
            <Input
              type="password"
              placeholder="Password"
              value={credentialPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCredentialPassword(e.target.value)
              }
              className="h-8 text-xs"
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  void handleSaveCredentials();
                }
              }}
            />
            {credentialError && <p className="text-xs text-destructive">{credentialError}</p>}
            {credentialSuccess && (
              <p className="text-xs text-green-500 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Credentials verified and saved
              </p>
            )}
            <Button
              size="sm"
              onClick={() => void handleSaveCredentials()}
              disabled={credentialSaving}
              className="h-8 text-xs"
            >
              {credentialSaving ? "Validating..." : "Save Credentials"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// About Tab
// ---------------------------------------------------------------------------

const AboutTab: React.FC = () => {
  const api = (window as unknown as { gamelord: GamelordAPI }).gamelord;
  const { play: playSfx } = useSfx();
  const [checking, setChecking] = useState(false);

  const handleCheckForUpdates = async () => {
    playSfx("click");
    setChecking(true);
    try {
      await api.updates.checkNow();
    } finally {
      // Reset after a short delay so the user sees feedback
      setTimeout(() => setChecking(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">GameLord</h2>
        <p className="text-sm text-muted-foreground">v0.1.0-alpha</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleCheckForUpdates()}
          disabled={checking}
          className="h-8 text-xs gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
          {checking ? "Checking..." : "Check for Updates"}
        </Button>
      </div>

      <div>
        <SectionHeading>Links</SectionHeading>
        <div className="space-y-1">
          <a
            href="https://github.com/ryanmagoon/gamelord"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            GitHub Repository
          </a>
          <a
            href="https://github.com/ryanmagoon/gamelord/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Report an Issue
          </a>
        </div>
      </div>

      <div>
        <SectionHeading>Credits</SectionHeading>
        <div className="text-xs text-muted-foreground space-y-1.5">
          <p>Built with Electron, React, and libretro.</p>
          <p>Cover art and metadata provided by ScreenScraper.</p>
          <p>Shader effects ported from the libretro slang-shaders collection.</p>
        </div>
      </div>

      <div>
        <SectionHeading>Acknowledgements</SectionHeading>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>libretro / RetroArch &mdash; emulation cores and shader ecosystem</p>
          <p>ScreenScraper &mdash; game metadata database</p>
          <p>Geist Pixel &mdash; typeface by Vercel</p>
        </div>
      </div>
    </div>
  );
};
