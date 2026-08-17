/**
 * Pagination detection — provider-aware, header-driven, UI-agnostic.
 *
 * GitAPITaker never fabricates page counts: it only reports what the
 * provider's response headers actually say.
 *   - GitHub/Gitea: RFC5988 `Link` header (rel="next"/"prev"/"last").
 *   - GitLab: `x-page`, `x-next-page`, `x-prev-page`, `x-total`, `x-per-page`.
 */

/**
 * Parse an RFC5988 Link header into {rel: url} pairs.
 * @param {string | null | undefined} header
 * @returns {Record<string, string>}
 */
export function parseLinkHeader(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (m) out[m[2]] = m[1];
  }
  return out;
}

/**
 * Detect pagination signals in a response.
 * @param {{providerId: string, url: string, headers: Array<[string, string]>}} args
 * @returns {null | {
 *   mode: 'link' | 'headers',
 *   nextUrl: string | null,
 *   prevUrl: string | null,
 *   lastUrl?: string | null,
 *   current?: number,
 *   total?: number,
 *   perPage?: number,
 * }}
 */
export function detectPagination({ providerId, url, headers }) {
  const headerMap = new Map((headers ?? []).map(([k, v]) => [k.toLowerCase(), v]));

  if (providerId === 'gitlab') {
    const page = headerMap.get('x-page');
    if (!page) return null;
    const nextPage = headerMap.get('x-next-page');
    const prevPage = headerMap.get('x-prev-page');
    const total = headerMap.get('x-total');
    const perPage = headerMap.get('x-per-page');
    const withPage = (p) => {
      const u = new URL(url);
      u.searchParams.set('page', String(p));
      return u.toString();
    };
    return {
      mode: 'headers',
      current: Number(page),
      total: total ? Number(total) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
      nextUrl: nextPage && Number(nextPage) > 0 ? withPage(Number(nextPage)) : null,
      prevUrl: prevPage && Number(prevPage) >= 1 ? withPage(Number(prevPage)) : null,
    };
  }

  const link = parseLinkHeader(headerMap.get('link'));
  if (!link.next && !link.prev) return null;
  return {
    mode: 'link',
    nextUrl: link.next ?? null,
    prevUrl: link.prev ?? null,
    lastUrl: link.last ?? null,
  };
}

/**
 * Human description of a pagination state (only what is actually known).
 * @param {ReturnType<typeof detectPagination>} pagination
 */
export function describePagination(pagination) {
  if (!pagination) return '';
  if (pagination.mode === 'headers') {
    const bits = [`page ${pagination.current}`];
    if (pagination.total !== undefined && Number.isFinite(pagination.total)) bits.push(`${pagination.total} items total`);
    if (pagination.perPage) bits.push(`${pagination.perPage}/page`);
    return bits.join(' · ');
  }
  return 'provider-supplied page links (Link header)';
}
