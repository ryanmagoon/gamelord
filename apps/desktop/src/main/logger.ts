import * as Sentry from "@sentry/electron/main";
import type { SeverityLevel } from "@sentry/electron/main";
import log from "electron-log/main";

// Configure log file rotation & format
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{scope}] {text}";
log.transports.console.format = "[{level}] [{scope}] {text}";

// Forward log entries to Sentry as breadcrumbs so crash reports include
// the structured log trail leading up to the error. This is additive —
// electron-log continues writing to file and console as before.
const severityMap: Record<string, SeverityLevel> = {
  error: "error",
  warn: "warning",
  info: "info",
  verbose: "debug",
  debug: "debug",
  silly: "debug",
};

log.hooks.push((message) => {
  const level = severityMap[message.level] ?? "info";
  Sentry.addBreadcrumb({
    category: `log.${message.scope ?? "default"}`,
    message: message.data.map(String).join(" "),
    level,
  });
  return message;
});

// Scoped loggers for each subsystem
export const ipcLog = log.scope("ipc");
export const emulatorLog = log.scope("emulator");
export const libraryLog = log.scope("library");
export const gameWindowLog = log.scope("gameWindow");
export const coreLog = log.scope("core");
export const retroArchLog = log.scope("retroarch");
export const libretroLog = log.scope("libretro");
export const artworkLog = log.scope("artwork");
export const mainLog = log.scope("main");
export const updaterLog = log.scope("updater");

export default log;
