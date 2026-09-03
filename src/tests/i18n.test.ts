import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLanguageFromUrl } from '@/js/i18n/i18n';

describe('getLanguageFromUrl', () => {
  const originalLocation = window.location;
  const originalNavigator = window.navigator;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, pathname: '/' },
      writable: true,
      configurable: true,
    });

    localStorage.clear();

    // Reset navigator
    Object.defineProperty(window, 'navigator', {
      value: { ...originalNavigator },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.navigator, 'languages', {
      value: [],
      configurable: true,
    });

    // Reset import.meta.env
    vi.stubEnv('BASE_URL', '/');
    vi.stubEnv('VITE_DEFAULT_LANGUAGE', 'en');
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    vi.unstubAllEnvs();
  });

  // This fork ships English only (supportedLanguages === ['en']), so every
  // resolution step below can only ever produce 'en'. What is still worth
  // asserting is the *order* — URL path, then stored preference, then
  // navigator, then the build-time default — and that anything outside the
  // supported set is rejected at each step rather than leaking through.

  it('returns the language in the URL path when it is supported', () => {
    window.location.pathname = '/en/about';
    expect(getLanguageFromUrl()).toBe('en');
  });

  it('ignores an unsupported language in the URL path', () => {
    window.location.pathname = '/de/about';
    expect(getLanguageFromUrl()).toBe('en');
  });

  it('falls back to the stored preference when the URL has no language', () => {
    window.location.pathname = '/about';
    localStorage.setItem('i18nextLng', 'en');
    expect(getLanguageFromUrl()).toBe('en');
  });

  it('ignores an unsupported stored preference', () => {
    window.location.pathname = '/about';
    localStorage.setItem('i18nextLng', 'it');
    expect(getLanguageFromUrl()).toBe('en');
  });

  it('matches navigator.languages on the primary subtag', () => {
    window.location.pathname = '/';
    Object.defineProperty(window.navigator, 'languages', {
      value: ['en-GB', 'en'],
      configurable: true,
    });
    expect(getLanguageFromUrl()).toBe('en');
  });

  it('ignores unsupported entries in navigator.languages', () => {
    window.location.pathname = '/';
    Object.defineProperty(window.navigator, 'languages', {
      value: ['xx-XX', 'es-ES', 'de-AT'],
      configurable: true,
    });
    expect(getLanguageFromUrl()).toBe('en');
  });

  it('ignores an unsupported build-time default language', () => {
    window.location.pathname = '/';
    Object.defineProperty(window.navigator, 'languages', {
      value: ['xx'],
      configurable: true,
    });
    vi.stubEnv('VITE_DEFAULT_LANGUAGE', 'vi');
    expect(getLanguageFromUrl()).toBe('en');
  });

  it('should fallback to en if everything else fails', () => {
    window.location.pathname = '/';
    Object.defineProperty(window.navigator, 'languages', {
      value: [],
      configurable: true,
    });
    vi.stubEnv('VITE_DEFAULT_LANGUAGE', '');
    expect(getLanguageFromUrl()).toBe('en');
  });

  it('should handle missing navigator object gracefully', () => {
    window.location.pathname = '/';
    Object.defineProperty(window, 'navigator', {
      value: undefined,
      writable: true,
    });
    expect(getLanguageFromUrl()).toBe('en');
  });
});
