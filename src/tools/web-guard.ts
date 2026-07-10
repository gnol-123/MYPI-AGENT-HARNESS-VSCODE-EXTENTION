import { lookup } from 'dns/promises';
import * as net from 'net';

/**
 * SSRF protection for agent-driven HTTP.
 *
 * The model chooses the URL, so the URL is untrusted input. Two traps:
 *  - a public hostname can resolve to a private address (DNS rebinding),
 *  - a public URL can 302 into the LAN.
 * So we resolve before connecting, and re-validate every redirect hop.
 */

const MAX_REDIRECTS = 5;

/** Returns a reason string when the address must not be contacted. */
export function isBlockedAddress(address: string): string | undefined {
  const addr = address.trim().toLowerCase();

  // ::ffff:127.0.0.1 smuggles an IPv4 address through an IPv6 literal.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]);

  if (net.isIPv4(addr)) {
    const p = addr.split('.').map(Number);
    if (p[0] === 0) return 'unspecified address';
    if (p[0] === 127) return 'loopback address';
    if (p[0] === 10) return 'private network (10.0.0.0/8)';
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return 'private network (172.16.0.0/12)';
    if (p[0] === 192 && p[1] === 168) return 'private network (192.168.0.0/16)';
    if (p[0] === 169 && p[1] === 254) return 'link-local / cloud metadata (169.254.0.0/16)';
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return 'carrier-grade NAT (100.64.0.0/10)';
    return undefined;
  }

  if (net.isIPv6(addr)) {
    if (addr === '::' ) return 'unspecified address';
    if (addr === '::1') return 'loopback address';
    if (/^fe[89ab]/.test(addr)) return 'link-local address';
    if (/^f[cd]/.test(addr)) return 'unique-local address';
    return undefined;
  }

  return undefined; // Not a literal address; the caller resolves it.
}

/** Cheap pre-flight: scheme + literal-IP checks, no DNS. */
export function validateUrl(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `Not a valid URL: ${raw}`;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return `Blocked scheme "${url.protocol}" — only http and https are allowed.`;
  }

  // URL keeps IPv6 literals in brackets.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const blocked = isBlockedAddress(host);
  if (blocked) return `Blocked: ${host} is a ${blocked}.`;

  return undefined;
}

/** `*.example.com` matches example.com and any subdomain, but not evil-example.com. */
export function hostMatchesPattern(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) {
    const suffix = p.slice(2);
    return h === suffix || h.endsWith('.' + suffix);
  }
  return h === p;
}

/** Resolves the host and rejects it if any answer is a private address. */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '');

  const literal = isBlockedAddress(host);
  if (literal) throw new Error(`Blocked: ${host} is a ${literal}.`);
  if (net.isIP(host)) return;

  let results: Array<{ address: string }>;
  try {
    results = await lookup(host, { all: true });
  } catch {
    throw new Error(`Could not resolve host: ${host}`);
  }

  for (const { address } of results) {
    const reason = isBlockedAddress(address);
    if (reason) {
      throw new Error(`Blocked: ${host} resolves to ${address}, a ${reason}.`);
    }
  }
}

export interface SafeFetchResult {
  response: Response;
  finalUrl: string;
}

/**
 * fetch() with redirects followed manually so every hop is re-validated.
 * `redirect: 'manual'` is what makes the DNS check meaningful — otherwise the
 * platform would silently follow a 302 into 169.254.169.254.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<SafeFetchResult> {
  const { timeoutMs = 30_000, ...rest } = init;
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const invalid = validateUrl(current);
    if (invalid) throw new Error(invalid);

    const url = new URL(current);
    await assertPublicHost(url.hostname);

    const response = await fetch(current, {
      ...rest,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { response, finalUrl: current };
      current = new URL(location, current).toString();
      continue;
    }

    return { response, finalUrl: current };
  }

  throw new Error(`Too many redirects (>${MAX_REDIRECTS}) starting from ${rawUrl}`);
}
