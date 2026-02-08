// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ScreenScraperClient, ScreenScraperError } from './ScreenScraperClient';

const dummyCredentials = {
  devId: 'testdev',
  devPassword: 'testpass',
  userId: 'testuser',
  userPassword: 'testuserpass',
};

/** Realistic fixture based on actual ScreenScraper jeuInfos responses. */
function makeGameResponseFixture(overrides?: Record<string, unknown>) {
  return {
    header: { APIversion: '2', success: 'true' },
    response: {
      jeu: {
        id: '12345',
        noms: [
          { region: 'jp', text: 'Super Mario Bros.' },
          { region: 'us', text: 'Super Mario Bros.' },
          { region: 'eu', text: 'Super Mario Bros.' },
        ],
        synopsis: [
          { langue: 'fr', text: 'Un jeu de plateforme classique.' },
          { langue: 'en', text: 'A classic platform game featuring Mario.' },
          { langue: 'de', text: 'Ein klassisches Plattformspiel.' },
        ],
        developpeur: { text: 'Nintendo R&D4' },
        editeur: { text: 'Nintendo' },
        joueurs: { text: '2' },
        note: { text: '18' },
        dates: [
          { region: 'jp', text: '1985-09-13' },
          { region: 'us', text: '1985-10-18' },
          { region: 'eu', text: '1987-05-15' },
        ],
        genres: [
          {
            noms: [
              { langue: 'en', text: 'Platform' },
              { langue: 'fr', text: 'Plateforme' },
            ],
          },
          {
            noms: [
              { langue: 'en', text: 'Action' },
              { langue: 'fr', text: 'Action' },
            ],
          },
        ],
        medias: [
          { type: 'box-2D', region: 'us', url: 'https://screenscraper.fr/medias/box2d-us.png', format: 'png' },
          { type: 'box-2D', region: 'jp', url: 'https://screenscraper.fr/medias/box2d-jp.png', format: 'png' },
          { type: 'box-2D', region: 'eu', url: 'https://screenscraper.fr/medias/box2d-eu.png', format: 'png' },
          { type: 'box-3D', region: 'us', url: 'https://screenscraper.fr/medias/box3d-us.png', format: 'png' },
          { type: 'ss', region: 'us', url: 'https://screenscraper.fr/medias/ss-us.png', format: 'png' },
          { type: 'fanart', region: 'wor', url: 'https://screenscraper.fr/medias/fanart-wor.png', format: 'png' },
        ],
        ...overrides,
      },
    },
  };
}

function makeSearchResponseFixture() {
  return {
    header: { APIversion: '2', success: 'true' },
    response: {
      jeux: [
        {
          id: '12345',
          noms: [{ region: 'us', text: 'Super Mario Bros.' }],
          developpeur: { text: 'Nintendo R&D4' },
          editeur: { text: 'Nintendo' },
          joueurs: { text: '2' },
          note: { text: '18' },
          dates: [{ region: 'us', text: '1985-10-18' }],
          genres: [{ noms: [{ langue: 'en', text: 'Platform' }] }],
          synopsis: [{ langue: 'en', text: 'A classic platformer.' }],
          medias: [
            { type: 'box-2D', region: 'us', url: 'https://screenscraper.fr/medias/box2d-us.png', format: 'png' },
          ],
        },
      ],
    },
  };
}

describe('ScreenScraperClient', () => {
  describe('parseGameResponse', () => {
    it('parses a full game response with all fields', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture();
      const result = client.parseGameResponse(fixture);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Super Mario Bros.');
      expect(result!.developer).toBe('Nintendo R&D4');
      expect(result!.publisher).toBe('Nintendo');
      expect(result!.genre).toBe('Platform');
      expect(result!.synopsis).toBe('A classic platform game featuring Mario.');
      expect(result!.players).toBe(2);
      expect(result!.rating).toBeCloseTo(0.9); // 18/20
      expect(result!.releaseDate).toBe('1985-10-18'); // US preferred
    });

    it('selects US region for box art and screenshots', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture();
      const result = client.parseGameResponse(fixture);

      expect(result!.media.boxArt2d).toBe('https://screenscraper.fr/medias/box2d-us.png');
      expect(result!.media.boxArt3d).toBe('https://screenscraper.fr/medias/box3d-us.png');
      expect(result!.media.screenshot).toBe('https://screenscraper.fr/medias/ss-us.png');
    });

    it('falls back to world region when US is not available', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture();
      const result = client.parseGameResponse(fixture);

      // fanart only has 'wor' region in fixture
      expect(result!.media.fanart).toBe('https://screenscraper.fr/medias/fanart-wor.png');
    });

    it('prefers English synopsis over other languages', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture();
      const result = client.parseGameResponse(fixture);

      expect(result!.synopsis).toBe('A classic platform game featuring Mario.');
    });

    it('falls back to French synopsis when English is unavailable', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture({
        synopsis: [
          { langue: 'fr', text: 'Un jeu de plateforme.' },
          { langue: 'de', text: 'Ein Plattformspiel.' },
        ],
      });
      const result = client.parseGameResponse(fixture);

      expect(result!.synopsis).toBe('Un jeu de plateforme.');
    });

    it('returns null for empty response', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const result = client.parseGameResponse({});
      expect(result).toBeNull();
    });

    it('returns null when response has no jeu', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const result = client.parseGameResponse({ response: {} });
      expect(result).toBeNull();
    });

    it('handles missing optional fields gracefully', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture({
        synopsis: undefined,
        developpeur: undefined,
        editeur: undefined,
        joueurs: undefined,
        note: undefined,
        genres: undefined,
        medias: undefined,
      });
      const result = client.parseGameResponse(fixture);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Super Mario Bros.');
      expect(result!.synopsis).toBeUndefined();
      expect(result!.developer).toBeUndefined();
      expect(result!.publisher).toBeUndefined();
      expect(result!.players).toBeUndefined();
      expect(result!.rating).toBeUndefined();
      expect(result!.genre).toBeUndefined();
      expect(result!.media.boxArt2d).toBeUndefined();
    });

    it('normalizes rating from 0-20 scale to 0-1', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture({ note: { text: '10' } });
      const result = client.parseGameResponse(fixture);

      expect(result!.rating).toBeCloseTo(0.5);
    });

    it('handles non-numeric players text', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture({ joueurs: { text: 'N/A' } });
      const result = client.parseGameResponse(fixture);

      expect(result!.players).toBeUndefined();
    });
  });

  describe('parseSearchResponse', () => {
    it('returns the first game from search results', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeSearchResponseFixture();
      const result = client.parseSearchResponse(fixture);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Super Mario Bros.');
      expect(result!.media.boxArt2d).toBe('https://screenscraper.fr/medias/box2d-us.png');
    });

    it('returns null for empty search results', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const result = client.parseSearchResponse({
        header: { APIversion: '2', success: 'true' },
        response: { jeux: [] },
      });
      expect(result).toBeNull();
    });

    it('returns null when search response has no jeux', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const result = client.parseSearchResponse({ response: {} });
      expect(result).toBeNull();
    });
  });

  describe('region preference', () => {
    it('prefers US over EU over JP for titles', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture({
        noms: [
          { region: 'jp', text: 'JP Title' },
          { region: 'eu', text: 'EU Title' },
          { region: 'us', text: 'US Title' },
        ],
      });
      const result = client.parseGameResponse(fixture);
      expect(result!.title).toBe('US Title');
    });

    it('falls back through region priority when preferred region is missing', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture({
        noms: [
          { region: 'jp', text: 'JP Title' },
          { region: 'eu', text: 'EU Title' },
        ],
      });
      const result = client.parseGameResponse(fixture);
      // 'wor' is second priority, not present, then 'eu' is third
      expect(result!.title).toBe('EU Title');
    });

    it('falls back to first available entry when no preferred region matches', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture({
        noms: [{ region: 'br', text: 'BR Title' }],
      });
      const result = client.parseGameResponse(fixture);
      expect(result!.title).toBe('BR Title');
    });
  });

  describe('media selection', () => {
    it('returns undefined when no media of requested type exists', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture({
        medias: [
          { type: 'box-2D', region: 'us', url: 'https://example.com/box.png' },
        ],
      });
      const result = client.parseGameResponse(fixture);

      expect(result!.media.boxArt2d).toBe('https://example.com/box.png');
      expect(result!.media.fanart).toBeUndefined();
    });

    it('selects media with region fallback', () => {
      const client = new ScreenScraperClient(dummyCredentials);
      const fixture = makeGameResponseFixture({
        medias: [
          { type: 'box-2D', region: 'eu', url: 'https://example.com/box-eu.png' },
        ],
      });
      const result = client.parseGameResponse(fixture);
      expect(result!.media.boxArt2d).toBe('https://example.com/box-eu.png');
    });
  });

  describe('ScreenScraperError', () => {
    it('carries errorCode and statusCode', () => {
      const error = new ScreenScraperError('Auth failed', 401, 'auth-failed');

      expect(error.message).toBe('Auth failed');
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe('auth-failed');
      expect(error.name).toBe('ScreenScraperError');
      expect(error).toBeInstanceOf(Error);
    });

    it('defaults errorCode to network-error', () => {
      const error = new ScreenScraperError('Something broke', 500);

      expect(error.errorCode).toBe('network-error');
    });

    it('supports all defined error codes', () => {
      const codes = ['timeout', 'auth-failed', 'rate-limited', 'network-error', 'parse-error'] as const;
      for (const code of codes) {
        const error = new ScreenScraperError(`Error: ${code}`, 0, code);
        expect(error.errorCode).toBe(code);
      }
    });
  });
});
