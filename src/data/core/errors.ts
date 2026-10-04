export type CoreErrorKind = 'unauthorized' | 'forbidden' | 'not-found' | 'validation' | 'conflict' | 'server' | 'network' | 'protocol' | 'read-only';

export class CoreError extends Error {
  constructor(public readonly kind: CoreErrorKind, public readonly status?: number) {
    super(`Core request failed: ${kind}`);
    this.name = 'CoreError';
  }
}

export function coreErrorMessage(error: unknown): string {
  if (!(error instanceof CoreError)) return 'Please try again in a moment.';
  switch (error.kind) {
    case 'network': return 'We couldn’t reach Core. Check your connection and that Core is available.';
    case 'server': return 'Core is temporarily unavailable. Please try again in a moment.';
    case 'forbidden': return 'Your account doesn’t have permission to view this information.';
    case 'not-found': return 'This home is no longer available to your account. Choose another home or sign in again.';
    case 'unauthorized': return 'Your session has expired. Sign in again to continue.';
    case 'protocol': return 'Core returned information this version of KZ Home can’t read. Please check version compatibility.';
    case 'validation': return 'Check the information you entered and try again.';
    case 'conflict': return 'This request couldn’t be completed. Refresh and try again.';
    case 'read-only': return 'Core is connected in read-only mode. Real controls aren’t enabled yet.';
  }
}
