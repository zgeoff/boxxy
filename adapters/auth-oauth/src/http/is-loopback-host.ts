// Copied from atc: packages/mcp/src/http/is-loopback-host.ts at commit 4fe647cf.

export function isLoopbackHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(host)
  );
}
