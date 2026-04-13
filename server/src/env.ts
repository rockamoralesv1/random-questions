import { config } from 'dotenv';
import { resolve } from 'path';

// __dirname is server/src/ at runtime — ../../ reaches the monorepo root
config({ path: resolve(__dirname, '../../.env') });
// Fallback: server/.env for per-developer local overrides
config({ path: resolve(__dirname, '../.env') });

// ── Global fetch proxy patch ───────────────────────────────────────────────
// SDKs that use Node 18+ native fetch (e.g. ElevenLabs) bypass http.Agent.
// Patching global.fetch with a proxy-aware node-fetch covers them all.
//
// Safety: for PAC proxies, verify the PAC host is reachable before applying
// the patch. If it times out (e.g. corporate PAC set on a cloud server by
// mistake), we skip the patch instead of hanging every outgoing API call.

const proxyUrl =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy;

if (proxyUrl) {
  (async () => {
    try {
      const isPac =
        proxyUrl.startsWith('pac+') ||
        proxyUrl.endsWith('.pac') ||
        proxyUrl.includes('.pac?');

      // For PAC proxies, do a quick reachability check before committing.
      // If the PAC host is unreachable (e.g. corporate proxy URL on Heroku),
      // skip the patch so API calls go direct instead of hanging.
      if (isPac) {
        const pacHost = new URL(proxyUrl.replace(/^pac\+/, '')).hostname;
        const reachable = await Promise.race([
          fetch(`https://${pacHost}`, { method: 'HEAD' })
            .then(() => true)
            .catch(() => false),
          new Promise<false>((res) => setTimeout(() => res(false), 3000)),
        ]);

        if (!reachable) {
          console.warn(`[proxy] PAC host unreachable (${pacHost}) — skipping proxy patch, using direct connection`);
          return;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeFetch = (await import('node-fetch')).default;

      let agent: import('http').Agent;
      if (isPac) {
        const { PacProxyAgent } = await import('pac-proxy-agent');
        agent = new PacProxyAgent(
          proxyUrl.startsWith('pac+') ? proxyUrl : `pac+${proxyUrl}`,
        );
      } else {
        const { HttpsProxyAgent } = await import('https-proxy-agent');
        agent = new HttpsProxyAgent(proxyUrl);
      }

      // Override global fetch so every SDK using native fetch goes through the proxy
      (global as unknown as Record<string, unknown>).fetch = (
        url: Parameters<typeof fetch>[0],
        opts: Parameters<typeof fetch>[1] = {},
      ) => nodeFetch(url as string, { ...(opts as object), agent }) as unknown as Promise<Response>;

      console.log(`[proxy] Global fetch patched (${isPac ? 'PAC' : 'direct'}): ${proxyUrl}`);
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[proxy] Could not patch global fetch — using direct connection: ${msg}`);
    }
  })();
}
