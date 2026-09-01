const HOST_WITH_PORT_PATTERN = /:\d+$/;
const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type SubdomainParseResult =
  | { readonly kind: "tenant"; readonly subdomain: string }
  | { readonly kind: "non-tenant"; readonly reason: string };

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(HOST_WITH_PORT_PATTERN, "");
}

export function parseTenantSubdomain(
  host: string | undefined,
  rootDomain = "bisby.pro",
): SubdomainParseResult {
  if (!host) {
    return { kind: "non-tenant", reason: "missing-host" };
  }

  const normalizedHost = normalizeHost(host);
  const normalizedRoot = rootDomain.trim().toLowerCase();

  if (
    normalizedHost === normalizedRoot ||
    normalizedHost === `www.${normalizedRoot}` ||
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "::1"
  ) {
    return { kind: "non-tenant", reason: "host-is-not-tenant" };
  }

  const suffix = `.${normalizedRoot}`;
  if (!normalizedHost.endsWith(suffix)) {
    return { kind: "non-tenant", reason: "host-is-outside-root-domain" };
  }

  const subdomain = normalizedHost.slice(0, -suffix.length);
  if (subdomain.includes(".") || !SUBDOMAIN_PATTERN.test(subdomain)) {
    return { kind: "non-tenant", reason: "invalid-subdomain" };
  }

  return { kind: "tenant", subdomain };
}