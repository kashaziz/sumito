/**
 * Normalise a custom domain from the environment to a bare host name.
 * Accepts "sumito.example.com", "https://sumito.example.com/", "sumito.example.com/path" and similar.
 */
export function normalizeDomain(value: string | undefined): string | undefined {
  const host = value?.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/[/?#].*$/, "").toLowerCase();
  return host || undefined;
}
