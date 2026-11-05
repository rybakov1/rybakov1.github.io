import { describe, expect, it } from 'vitest';
import { permanentTarget } from '../worker/redirects';

function go(href: string, scheme: 'http' | 'https' = 'https') {
  return permanentTarget(new URL(href), scheme);
}

describe('permanentTarget', () => {
  it('301s a slashless HTML route and leaves the slashed URL alone', () => {
    expect(go('https://autradeshows.com/shows/city/melbourne')).toBe(
      'https://autradeshows.com/shows/city/melbourne/',
    );
    expect(go('https://autradeshows.com/shows/city/melbourne/')).toBeNull();
  });

  it('folds http and www into the same hop as the trailing slash', () => {
    expect(go('http://www.autradeshows.com/shows', 'http')).toBe('https://autradeshows.com/shows/');
    expect(go('https://www.autradeshows.com/about/', 'https')).toBe('https://autradeshows.com/about/');
  });

  it('keeps the query string on the slashed path', () => {
    expect(go('https://autradeshows.com/stand-brief?show=aime-2027')).toBe(
      'https://autradeshows.com/stand-brief/?show=aime-2027',
    );
  });

  it('sends contact and old aliases straight to the slashed page', () => {
    expect(go('https://autradeshows.com/contact')).toBe('https://autradeshows.com/about/#contact');
    expect(go('https://autradeshows.com/contact/')).toBe('https://autradeshows.com/about/#contact');
    expect(go('https://autradeshows.com/builders')).toBe(
      'https://autradeshows.com/exhibition-stand-builders/',
    );
  });

  it('does not slash files or the lead endpoint', () => {
    expect(go('https://autradeshows.com/favicon.svg')).toBeNull();
    expect(go('https://autradeshows.com/sitemap-index.xml')).toBeNull();
    expect(go('https://autradeshows.com/api/lead')).toBeNull();
  });

  it('still slashes on a local host without sending it to production', () => {
    expect(go('http://127.0.0.1:8788/shows', 'http')).toBe('http://127.0.0.1:8788/shows/');
  });
});
