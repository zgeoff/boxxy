// A browser marks each request a page makes: `Origin` on every POST, `Sec-Fetch-Site` on every
// request. No caller of the server is a page, and a page on a site that resolves to a listener can
// send a write with no CORS preflight. `Sec-Fetch-Site: none` is an address typed by a person.
export function isBrowserRequest(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site');

  return headers.has('origin') || (site !== null && site !== 'none');
}
