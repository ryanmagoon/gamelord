import https from "node:https";
import {
  ScreenScraperCredentials,
  ScreenScraperGameInfo,
  SYSTEM_ID_MAP,
} from "../../types/artwork";

/**
 * Persistent HTTPS agent with keep-alive for connection reuse.
 * Avoids TCP+TLS handshake overhead (~200-400ms) on every request
 * to the ScreenScraper API during batch operations.
 */
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 4,
  keepAliveMsecs: 30_000,
});

/** Region preference order for selecting localized content. */
const REGION_PRIORITY = ["us", "wor", "eu", "ss", "jp"];

/** Language preference order for selecting localized text. */
const LANGUAGE_PRIORITY = ["en", "fr", "es", "de", "pt", "it"];

/** Timeout for API requests in milliseconds (15 seconds). */
const API_TIMEOUT_MS = 15_000;

export type ScreenScraperErrorCode =
  | "timeout"
  | "auth-failed"
  | "config-error"
  | "rate-limited"
  | "network-error"
  | "parse-error";

/**
 * Low-level HTTP client for the ScreenScraper API v2.
 * Handles request construction, response parsing, and region/language selection.
 */
export class ScreenScraperClient {
  private credentials: ScreenScraperCredentials;
  private baseUrl = "https://api.screenscraper.fr/api2";

  constructor(credentials: ScreenScraperCredentials) {
    this.credentials = credentials;
  }

  /**
   * Validate that the configured credentials are accepted by ScreenScraper.
   * Uses the lightweight ssuserInfos endpoint which requires auth but
   * doesn't count against game lookup quotas.
   */
  async validateCredentials(): Promise<void> {
    const params = new URLSearchParams({
      devid: this.credentials.devId,
      devpassword: this.credentials.devPassword,
      output: "json",
      softname: "GameLord",
      ssid: this.credentials.userId,
      sspassword: this.credentials.userPassword,
    });

    const url = `${this.baseUrl}/ssuserInfos.php?${params.toString()}`;
    await this.httpGet(url);
  }

  /** Throw early if developer API credentials are missing, before making a doomed request. */
  private assertDevCredentials(): void {
    if (!this.credentials.devId || !this.credentials.devPassword) {
      throw new ScreenScraperError(
        "ScreenScraper API is not configured. Developer credentials are missing from the .env file.",
        0,
        "config-error",
      );
    }
  }

  /**
   * Look up a game by ROM content hash.
   * Returns parsed game info or null if no match found.
   */
  async fetchByHash(md5: string, systemId: string): Promise<ScreenScraperGameInfo | null> {
    const screenScraperSystemId = SYSTEM_ID_MAP[systemId];
    if (screenScraperSystemId === undefined) {
      return null;
    }

    const params = new URLSearchParams({
      devid: this.credentials.devId,
      devpassword: this.credentials.devPassword,
      md5: md5.toLowerCase(),
      output: "json",
      softname: "GameLord",
      ssid: this.credentials.userId,
      sspassword: this.credentials.userPassword,
      systemeid: String(screenScraperSystemId),
    });

    const url = `${this.baseUrl}/jeuInfos.php?${params.toString()}`;

    try {
      const json = await this.httpGet(url);
      return this.parseGameResponse(json);
    } catch (error) {
      if (error instanceof ScreenScraperError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search for a game by name. Falls back to this when hash lookup fails.
   * Returns the first match or null.
   */
  async fetchByName(name: string, systemId: string): Promise<ScreenScraperGameInfo | null> {
    const screenScraperSystemId = SYSTEM_ID_MAP[systemId];
    if (screenScraperSystemId === undefined) {
      return null;
    }

    const params = new URLSearchParams({
      devid: this.credentials.devId,
      devpassword: this.credentials.devPassword,
      output: "json",
      recherche: name,
      softname: "GameLord",
      ssid: this.credentials.userId,
      sspassword: this.credentials.userPassword,
      systemeid: String(screenScraperSystemId),
    });

    const url = `${this.baseUrl}/jeuRecherche.php?${params.toString()}`;

    try {
      const json = await this.httpGet(url);
      return this.parseSearchResponse(json);
    } catch (error) {
      if (error instanceof ScreenScraperError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Parse a jeuInfos API response into a normalized ScreenScraperGameInfo.
   * The ScreenScraper API uses French field names with deeply nested structures.
   */
  parseGameResponse(json: unknown): ScreenScraperGameInfo | null {
    const data = json as Record<string, unknown>;
    const response = data?.response as Record<string, unknown> | undefined;
    const jeu = response?.jeu as Record<string, unknown> | undefined;

    if (!jeu) {
      return null;
    }

    return this.extractGameInfo(jeu);
  }

  /**
   * Parse a jeuRecherche (search) API response.
   * Returns the first matching game or null.
   */
  parseSearchResponse(json: unknown): ScreenScraperGameInfo | null {
    const data = json as Record<string, unknown>;
    const response = data?.response as Record<string, unknown> | undefined;
    const jeux = response?.jeux as Record<string, unknown>[] | undefined;

    if (!jeux || jeux.length === 0) {
      return null;
    }

    return this.extractGameInfo(jeux[0]);
  }

  /**
   * Extract normalized game info from a ScreenScraper `jeu` object.
   */
  private extractGameInfo(jeu: Record<string, unknown>): ScreenScraperGameInfo {
    const titleResult = this.selectRegionText(jeu.noms as LocalizedEntry[] | undefined);
    const title = titleResult?.text ?? "Unknown";
    const region = titleResult?.region;

    // Game-level ID — shared across all discs of the same title
    const gameId = typeof jeu.id === "string" && jeu.id.length > 0 ? jeu.id : undefined;
    const synopsis = this.selectLanguageText(jeu.synopsis as LocalizedEntry[] | undefined);
    const developer = (jeu.developpeur as TextEntry | undefined)?.text;
    const publisher = (jeu.editeur as TextEntry | undefined)?.text;
    const genre = this.extractGenre(jeu.genres as GenreEntry[] | undefined);
    const playersText = (jeu.joueurs as TextEntry | undefined)?.text;
    const players = playersText ? Number.parseInt(playersText, 10) || undefined : undefined;
    const ratingText = (jeu.note as TextEntry | undefined)?.text;
    const rating = ratingText ? Number.parseFloat(ratingText) / 20 : undefined;
    const releaseDate = this.selectRegionText(jeu.dates as LocalizedEntry[] | undefined)?.text;

    const medias = jeu.medias as MediaEntry[] | undefined;
    const media = {
      boxArt2d: this.selectMedia(medias, "box-2D"),
      boxArt3d: this.selectMedia(medias, "box-3D"),
      fanart: this.selectMedia(medias, "fanart"),
      screenshot: this.selectMedia(medias, "ss"),
    };

    // Extract ROM-level fields from the matched ROM entry (hash-based lookups only).
    // jeu.rom is the specific ROM that matched the hash.
    const rom = jeu.rom as Record<string, unknown> | undefined;
    const romRegionsObj = rom?.regions as Record<string, unknown> | undefined;
    const romRegionsRaw = romRegionsObj?.regions_shortname;
    const romRegions = Array.isArray(romRegionsRaw)
      ? (romRegionsRaw as Array<string>).filter((r) => typeof r === "string" && r.length > 0)
      : undefined;

    // jeu.rom.discnum — 1-indexed disc number for multi-disc games (e.g. "2")
    const discNumRaw = rom?.discnum;
    const discNumParsed =
      typeof discNumRaw === "string" ? Number.parseInt(discNumRaw, 10) : undefined;
    const discNumber =
      discNumParsed !== undefined && Number.isFinite(discNumParsed) ? discNumParsed : undefined;

    return {
      ...(gameId !== undefined ? { gameId } : {}),
      developer,
      ...(discNumber !== undefined ? { discNumber } : {}),
      genre,
      media,
      players,
      publisher,
      rating,
      region,
      releaseDate,
      ...(romRegions && romRegions.length > 0 ? { romRegions } : {}),
      synopsis,
      title,
    };
  }

  /**
   * Select the best text entry from a region-tagged array using the priority list.
   * Returns both the selected text and the winning region code.
   */
  private selectRegionText(
    entries: LocalizedEntry[] | undefined,
  ): { region: string; text: string } | undefined {
    if (!entries || entries.length === 0) {
      return undefined;
    }

    for (const region of REGION_PRIORITY) {
      const match = entries.find((entry) => entry.region === region);
      if (match?.text) {
        return { text: match.text, region };
      }
    }

    // Fallback to first available entry with text
    const fallback = entries.find((entry) => entry.text);
    if (fallback?.text) {
      return { text: fallback.text, region: fallback.region ?? "us" };
    }

    return undefined;
  }

  /**
   * Select the best text entry from a language-tagged array.
   */
  private selectLanguageText(entries: LocalizedEntry[] | undefined): string | undefined {
    if (!entries || entries.length === 0) {
      return undefined;
    }

    for (const language of LANGUAGE_PRIORITY) {
      const match = entries.find((entry) => entry.langue === language);
      if (match?.text) {
        return match.text;
      }
    }

    return entries.find((entry) => entry.text)?.text;
  }

  /**
   * Extract the primary genre name from the genres array.
   */
  private extractGenre(genres: GenreEntry[] | undefined): string | undefined {
    if (!genres || genres.length === 0) {
      return undefined;
    }

    const firstGenre = genres[0];
    const noms = firstGenre?.noms as LocalizedEntry[] | undefined;
    if (!noms) {
      return undefined;
    }

    // Prefer English genre name
    for (const language of LANGUAGE_PRIORITY) {
      const match = noms.find((entry) => entry.langue === language);
      if (match?.text) {
        return match.text;
      }
    }

    return noms.find((entry) => entry.text)?.text;
  }

  /**
   * Select the best media URL for a given type, preferring US region.
   */
  private selectMedia(medias: MediaEntry[] | undefined, type: string): string | undefined {
    if (!medias) {
      return undefined;
    }

    const candidates = medias.filter((media) => media.type === type);
    if (candidates.length === 0) {
      return undefined;
    }

    for (const region of REGION_PRIORITY) {
      const match = candidates.find((media) => media.region === region);
      if (match?.url) {
        return match.url;
      }
    }

    // Fallback: any media of this type with a URL
    return candidates.find((media) => media.url)?.url;
  }

  /**
   * Make an HTTPS GET request and parse the JSON response.
   * Includes a 15-second timeout and maps HTTP status codes to structured error codes.
   */
  private httpGet(url: string): Promise<unknown> {
    this.assertDevCredentials();

    return new Promise((resolve, reject) => {
      const follow = (targetUrl: string, redirectCount: number) => {
        if (redirectCount > 5) {
          reject(new ScreenScraperError("Too many redirects", 0, "network-error"));
          return;
        }

        const request = https.get(targetUrl, { agent: keepAliveAgent }, (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            response.destroy();
            follow(response.headers.location, redirectCount + 1);
            return;
          }

          if (response.statusCode === 429) {
            response.destroy();
            reject(
              new ScreenScraperError(
                "Rate limited by ScreenScraper. Try again later.",
                429,
                "rate-limited",
              ),
            );
            return;
          }

          if (response.statusCode === 401 || response.statusCode === 403) {
            response.destroy();
            reject(
              new ScreenScraperError(
                "Invalid username or password.",
                response.statusCode,
                "auth-failed",
              ),
            );
            return;
          }

          if (response.statusCode !== 200) {
            response.destroy();
            reject(
              new ScreenScraperError(
                `ScreenScraper returned HTTP ${response.statusCode}`,
                response.statusCode ?? 0,
                "network-error",
              ),
            );
            return;
          }

          const chunks: Array<Buffer> = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            try {
              const body = Buffer.concat(chunks).toString("utf8");
              resolve(JSON.parse(body));
            } catch {
              reject(
                new ScreenScraperError(
                  "Invalid JSON response from ScreenScraper.",
                  0,
                  "parse-error",
                ),
              );
            }
          });
          response.on("error", (error) => {
            reject(new ScreenScraperError(`Network error: ${error.message}`, 0, "network-error"));
          });
        });

        request.on("error", (error) => {
          reject(new ScreenScraperError(`Network error: ${error.message}`, 0, "network-error"));
        });

        request.setTimeout(API_TIMEOUT_MS, () => {
          request.destroy();
          reject(
            new ScreenScraperError(
              "Request to ScreenScraper timed out. The server may be slow or unreachable.",
              0,
              "timeout",
            ),
          );
        });
      };

      follow(url, 0);
    });
  }
}

/** Custom error class for ScreenScraper API errors with structured error codes. */
export class ScreenScraperError extends Error {
  statusCode: number;
  errorCode: ScreenScraperErrorCode;

  constructor(
    message: string,
    statusCode: number,
    errorCode: ScreenScraperErrorCode = "network-error",
  ) {
    super(message);
    this.name = "ScreenScraperError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

/** A text entry with a region tag (used for titles, dates). */
interface LocalizedEntry {
  langue?: string;
  region?: string;
  text?: string;
}

/** A simple object with a text field. */
interface TextEntry {
  text?: string;
}

/** A genre entry containing localized names. */
interface GenreEntry {
  noms?: Array<LocalizedEntry>;
}

/** A media entry from the ScreenScraper medias array. */
interface MediaEntry {
  format?: string;
  region?: string;
  type: string;
  url?: string;
}
