import type { AIProvider } from './types';

type ProviderFactory = () => AIProvider;

const providerRegistry = new Map<string, ProviderFactory>();

export function registerProvider(name: string, factory: ProviderFactory): void {
  if (providerRegistry.has(name)) {
    throw new Error(`AI provider "${name}" is already registered.`);
  }
  providerRegistry.set(name, factory);
}

export function getProvider(name?: string): AIProvider {
  const providerName = name ?? process.env.AI_PROVIDER ?? 'openai';
  const factory = providerRegistry.get(providerName);
  if (!factory) {
    const available = [...providerRegistry.keys()].join(', ');
    throw new Error(
      `Unknown AI provider "${providerName}". Registered: ${available}`,
    );
  }
  return factory();
}

export function getProviderWithFallback(
  primaryName?: string,
  fallbackName?: string,
): AIProvider {
  const primary = getProvider(primaryName);
  const fallbackEnv = fallbackName ?? process.env.AI_FALLBACK_PROVIDER;
  if (!fallbackEnv) return primary;

  const fallback = getProvider(fallbackEnv);
  return {
    name: `${primary.name}+${fallback.name}`,
    extraction: primary.extraction,
    grading: primary.grading,
    tts: primary.tts ?? fallback.tts,
    stt: primary.stt ?? fallback.stt,
  };
}
