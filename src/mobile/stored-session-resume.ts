import type { HttpClient } from '../data/core/http-client';

export async function checkCoreHealth(client: HttpClient): Promise<void> {
  await client.request('/health', value => {
    if (value === null || typeof value !== 'object' || !('status' in value) || value.status !== 'ok') {
      throw new Error('Unrecognized Core response');
    }
  }, { expectedStatus: 200 });
}

/** Health alone does not show that Core can rotate the stored refresh token. */
export async function checkCoreReadiness(client: HttpClient): Promise<void> {
  await client.request('/ready', value => {
    if (value === null || typeof value !== 'object' || !('status' in value) || value.status !== 'ready') {
      throw new Error('Unrecognized Core readiness response');
    }
  }, { expectedStatus: 200 });
}

/** Coalesce triggers. Only a failed anonymous probe may be attempted again. */
export function createStoredSessionResume(probe: () => Promise<void>, resume: () => Promise<void>) {
  let credentialBoundaryReached = false;
  let inFlight: Promise<void> | undefined;
  return (stillEligible: () => boolean): Promise<void> => {
    if (inFlight) return inFlight;
    if (credentialBoundaryReached || !stillEligible()) return Promise.resolve();

    inFlight = Promise.resolve().then(async () => {
      try {
        await probe(); // No token read, auth header, or credentials at this point.
      } catch {
        return; // A later foreground or Wi-Fi event may try this GET again.
      }
      if (!stillEligible()) return;
      // The next call may take the one-time token and its response can be lost.
      // Never unlock this path on any result, including an unknown POST result.
      credentialBoundaryReached = true;
      await resume();
    }).finally(() => { inFlight = undefined; });
    return inFlight;
  };
}
