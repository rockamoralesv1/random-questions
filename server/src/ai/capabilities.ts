import type { AIProvider } from './types';

export type CapabilityName = 'extraction' | 'grading' | 'tts' | 'stt';

export function requireCapability<T>(
  capability: T | null,
  providerName: string,
  capabilityName: CapabilityName,
): T {
  if (capability === null) {
    throw Object.assign(
      new Error(
        `Provider "${providerName}" does not support "${capabilityName}". ` +
          `Set AI_FALLBACK_PROVIDER to a provider that does.`,
      ),
      { status: 501 },
    );
  }
  return capability;
}

export function hasCapability(
  provider: AIProvider,
  name: CapabilityName,
): boolean {
  return provider[name] !== null;
}
