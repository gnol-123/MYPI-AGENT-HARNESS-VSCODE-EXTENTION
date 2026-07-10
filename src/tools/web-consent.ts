import { hostMatchesPattern } from './web-guard';

export type ConsentDecision = 'once' | 'domain' | 'deny';

/** Asks the user; injected so the policy is testable without vscode. */
export type ConsentPrompt = (host: string, url: string) => Promise<ConsentDecision>;

export interface WebPolicy {
  /** Domains never requiring a prompt. Supports `*.example.com`. */
  allowed: string[];
  /** Domains always denied, checked before everything else. */
  blocked: string[];
}

/**
 * Per-domain consent for outbound fetches.
 *
 * The real risk of giving an agent web access is not SSRF but exfiltration:
 * a fetched page can instruct the model to fetch attacker.com/?leak=<secrets>.
 * Approving a domain once per session keeps that channel under the user's eye
 * without prompting on every request.
 */
export class WebConsent {
  private sessionAllowed = new Set<string>();

  constructor(private policy: WebPolicy, private prompt: ConsentPrompt) {}

  updatePolicy(policy: WebPolicy): void {
    this.policy = policy;
  }

  /** Forget session grants — called when the user clears a session. */
  reset(): void {
    this.sessionAllowed.clear();
  }

  private matches(host: string, patterns: string[]): boolean {
    return patterns.some((p) => hostMatchesPattern(host, p));
  }

  /** Resolves to an error string when the fetch must not proceed. */
  async check(url: string): Promise<string | undefined> {
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return `Not a valid URL: ${url}`;
    }

    if (this.matches(host, this.policy.blocked)) {
      return `Blocked: ${host} is on the deny list (mypi-by-sl.webBlockedDomains).`;
    }
    if (this.matches(host, this.policy.allowed)) return undefined;
    if (this.sessionAllowed.has(host)) return undefined;

    const decision = await this.prompt(host, url);
    if (decision === 'domain') {
      this.sessionAllowed.add(host);
      return undefined;
    }
    if (decision === 'once') return undefined;

    return `The user denied access to ${host}. Do not retry this domain; ask the user before trying another source.`;
  }
}
