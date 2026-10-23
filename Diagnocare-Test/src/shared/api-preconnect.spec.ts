import { preconnectToApiOrigin } from 'src/app/shared/api-preconnect';

/**
 * PERF-009: the preconnect hint must appear for a cross-origin API and must
 * disappear by itself once the API is reached through the SPA's own origin.
 */
describe('preconnectToApiOrigin', () => {
  const links = () =>
    Array.from(document.head.querySelectorAll('link[rel="preconnect"]')) as HTMLLinkElement[];

  beforeEach(() => links().forEach(l => l.remove()));

  it('adds a credentials-less preconnect for a cross-origin API', () => {
    preconnectToApiOrigin('https://diagnocare-prod.runasp.net/');

    expect(links().map(l => [l.href, l.crossOrigin])).toEqual([
      ['https://diagnocare-prod.runasp.net/', 'anonymous'],
    ]);
  });

  it('adds nothing when the base URL is relative (same-origin deployment)', () => {
    preconnectToApiOrigin('/');

    expect(links()).toHaveLength(0);
  });

  it('adds nothing when the base URL is the page origin spelled out', () => {
    preconnectToApiOrigin(`${window.location.origin}/`);

    expect(links()).toHaveLength(0);
  });

  it('does not stack duplicates when called again', () => {
    preconnectToApiOrigin('https://diagnocare-prod.runasp.net/');
    preconnectToApiOrigin('https://diagnocare-prod.runasp.net/api/');

    expect(links()).toHaveLength(1);
  });

  it('ignores a base URL that does not parse', () => {
    preconnectToApiOrigin('http://');

    expect(links()).toHaveLength(0);
  });

  it('falls back to the configured API url when called with no argument', () => {
    // setup-jest.ts sets RUNTIME_CONFIG.diagnocareApiURL to http://localhost:5000/,
    // which is cross-origin to jsdom's own http://localhost.
    preconnectToApiOrigin();

    expect(links().map(l => l.href)).toEqual(['http://localhost:5000/']);
  });
});
