import { config } from 'dotenv';
import { resolve } from 'path';

// __dirname is server/src/ at runtime — ../../ reaches the monorepo root
config({ path: resolve(__dirname, '../../.env') });
// Fallback: server/.env for per-developer local overrides
config({ path: resolve(__dirname, '../.env') });

// ── Global fetch proxy patch ───────────────────────────────────────────────
// SDKs that use Node 18+ native fetch (e.g. ElevenLabs) bypass http.Agent.
// Patching global.fetch with a proxy-aware node-fetch covers them all.

const proxyUrl =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy;

if (proxyUrl) {
  (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeFetch = (await import('node-fetch')).default;
      const isPac =
        proxyUrl.startsWith('pac+') ||
        proxyUrl.endsWith('.pac') ||
        proxyUrl.includes('.pac?');

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
      console.log(`[proxy] node-fetch version: ${(await import('node-fetch')).default.name ?? 'ok'}`);
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[proxy] Could not patch global fetch — ElevenLabs will use direct connection: ${msg}`);
    }
  })();
}
