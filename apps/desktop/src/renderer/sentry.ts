import * as Sentry from "@sentry/electron/renderer";
import { init as reactInit } from "@sentry/react";

/**
 * Initialize Sentry in a renderer process (library window or game window).
 *
 * The DSN, release, and environment are inherited from the main process
 * via IPC — no configuration needed here beyond renderer-specific options.
 *
 * Session Replay is configured to record only on errors (the 30-second
 * buffer before the error), keeping quota usage low on the free tier.
 */
export function initSentryRenderer(): void {
  Sentry.init(
    {
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
    },
    reactInit,
  );
}
