import { HttpsProxyAgent } from 'https-proxy-agent';
import { PacProxyAgent } from 'pac-proxy-agent';
import type { Agent } from 'http';

let _agent: Agent | undefined | null = null;

/**
 * Returns a proxy agent for AI API calls, or undefined when no proxy is configured.
 *
 * Reads (in priority order):
 *   HTTPS_PROXY / https_proxy — direct proxy URL  e.g. http://proxy:8080
 *                               or PAC URL         e.g. pac+http://pac.example.com/proxy.pac
 *   HTTP_PROXY  / http_proxy  — fallback
 *
 * Works without any proxy configured — callers receive undefined and connect directly.
 */
export function getProxyAgent(): Agent | undefined {
  if (_agent !== null) return _agent;

  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;

  if (!proxyUrl) {
    _agent = undefined;
    return undefined;
  }

  const isPac =
    proxyUrl.startsWith('pac+') ||
    proxyUrl.endsWith('.pac') ||
    proxyUrl.includes('.pac?');

  _agent = isPac
    ? new PacProxyAgent(proxyUrl.startsWith('pac+') ? proxyUrl : `pac+${proxyUrl}`)
    : new HttpsProxyAgent(proxyUrl);

  console.log(`[proxy] ${isPac ? 'PAC' : 'direct'} proxy configured: ${proxyUrl}`);
  return _agent;
}
