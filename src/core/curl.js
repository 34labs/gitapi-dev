/**
 * Copy-as-cURL.
 *
 * The generated command represents exactly what GitAPITaker sends: method,
 * final URL and the headers the app actually sets. No credentials are ever
 * included (v0.1 performs unauthenticated requests only).
 */

/**
 * @param {import('./types.js').ResolvedEndpoint} endpoint
 * @returns {string}
 */
export function buildCurlCommand(endpoint) {
  const parts = ['curl', '-sS', '-X', endpoint.method || 'GET'];
  for (const [name, value] of Object.entries(endpoint.headers ?? {})) {
    parts.push('-H', shellQuote(`${name}: ${value}`));
  }
  parts.push(shellQuote(endpoint.url));
  return parts.join(' ');
}

/** POSIX single-quote escaping. */
export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
