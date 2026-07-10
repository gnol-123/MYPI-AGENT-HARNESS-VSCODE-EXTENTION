import { describe, it, expect } from 'vitest';
import { isBlockedAddress, validateUrl, hostMatchesPattern } from '../../tools/web-guard';

/**
 * SSRF protection. A URL string check is not enough: a public hostname can
 * resolve to a private address, and a public URL can redirect into the LAN.
 * These tests pin the address-level decisions the fetcher relies on.
 */

describe('isBlockedAddress', () => {
  it('blocks IPv4 loopback', () => {
    expect(isBlockedAddress('127.0.0.1')).toBeTruthy();
    expect(isBlockedAddress('127.255.255.254')).toBeTruthy();
  });

  it('blocks the cloud metadata endpoint', () => {
    // The one that leaks IAM credentials on AWS/GCP/Azure.
    expect(isBlockedAddress('169.254.169.254')).toBeTruthy();
  });

  it('blocks RFC1918 private ranges', () => {
    expect(isBlockedAddress('10.0.0.1')).toBeTruthy();
    expect(isBlockedAddress('172.16.0.1')).toBeTruthy();
    expect(isBlockedAddress('172.31.255.255')).toBeTruthy();
    expect(isBlockedAddress('192.168.1.1')).toBeTruthy();
  });

  it('does not over-block 172.32.x, which is public', () => {
    expect(isBlockedAddress('172.32.0.1')).toBeUndefined();
  });

  it('blocks IPv6 loopback, link-local and unique-local', () => {
    expect(isBlockedAddress('::1')).toBeTruthy();
    expect(isBlockedAddress('fe80::1')).toBeTruthy();
    expect(isBlockedAddress('fc00::1')).toBeTruthy();
    expect(isBlockedAddress('fd12:3456::1')).toBeTruthy();
  });

  it('blocks IPv4-mapped IPv6 loopback, a classic bypass', () => {
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBeTruthy();
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBeTruthy();
  });

  it('blocks 0.0.0.0 and IPv6 unspecified', () => {
    expect(isBlockedAddress('0.0.0.0')).toBeTruthy();
    expect(isBlockedAddress('::')).toBeTruthy();
  });

  it('allows ordinary public addresses', () => {
    expect(isBlockedAddress('1.1.1.1')).toBeUndefined();
    expect(isBlockedAddress('8.8.8.8')).toBeUndefined();
    expect(isBlockedAddress('2606:4700::1111')).toBeUndefined();
  });
});

describe('validateUrl', () => {
  it('rejects non-http(s) schemes', () => {
    expect(validateUrl('file:///etc/passwd')).toMatch(/scheme/i);
    expect(validateUrl('gopher://x/')).toMatch(/scheme/i);
    expect(validateUrl('data:text/html,hi')).toMatch(/scheme/i);
  });

  it('rejects a literal private IP in the URL without needing DNS', () => {
    expect(validateUrl('http://127.0.0.1:8080/admin')).toMatch(/private|blocked/i);
    expect(validateUrl('http://169.254.169.254/latest/meta-data/')).toMatch(/private|blocked/i);
    expect(validateUrl('http://[::1]:3000/')).toMatch(/private|blocked/i);
  });

  it('rejects malformed urls', () => {
    expect(validateUrl('not a url')).toBeTruthy();
  });

  it('accepts ordinary public https urls', () => {
    expect(validateUrl('https://docs.z.ai/guides/overview/pricing')).toBeUndefined();
    expect(validateUrl('http://example.com')).toBeUndefined();
  });
});

describe('hostMatchesPattern', () => {
  it('matches exact hosts', () => {
    expect(hostMatchesPattern('docs.z.ai', 'docs.z.ai')).toBe(true);
    expect(hostMatchesPattern('docs.z.ai', 'z.ai')).toBe(false);
  });

  it('matches wildcard subdomains but not the bare suffix trick', () => {
    expect(hostMatchesPattern('api.anthropic.com', '*.anthropic.com')).toBe(true);
    expect(hostMatchesPattern('anthropic.com', '*.anthropic.com')).toBe(true);
    // evil-anthropic.com must not match *.anthropic.com
    expect(hostMatchesPattern('evil-anthropic.com', '*.anthropic.com')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(hostMatchesPattern('DOCS.Z.AI', 'docs.z.ai')).toBe(true);
  });
});
