export type DriverGpsCapability = {
  hasGeolocation: boolean;
  isSecureContext: boolean;
};

export function driverRefreshCompletion(input: {
  mounted: boolean;
  requestId: number;
  currentRequestId: number;
  queued: boolean;
}): { accept: boolean; runQueued: boolean } {
  return {
    accept: input.mounted && input.requestId === input.currentRequestId,
    runQueued: input.mounted && input.queued,
  };
}

function rejectAfter<T>(source: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = globalThis.setTimeout(
      () => reject(new Error("Driver data source timed out.")),
      Math.max(1, timeoutMs),
    );
    source.then(resolve, reject).finally(() => globalThis.clearTimeout(timeout));
  });
}

export async function settleDriverSourcesWithin<T extends readonly unknown[]>(
  sources: { [K in keyof T]: Promise<T[K]> },
  timeoutMs: number,
): Promise<{ [K in keyof T]: PromiseSettledResult<T[K]> }> {
  return Promise.allSettled(
    sources.map((source) => rejectAfter(source, timeoutMs)),
  ) as Promise<{ [K in keyof T]: PromiseSettledResult<T[K]> }>;
}

export function nextDriverMapStyleAfterFailure(
  currentIndex: number,
  styleCount: number,
): number | null {
  const nextIndex = currentIndex + 1;
  return nextIndex < styleCount ? nextIndex : null;
}

export function driverGpsBlockReason(
  capability: DriverGpsCapability,
): "insecure" | "unsupported" | null {
  if (!capability.isSecureContext) return "insecure";
  if (!capability.hasGeolocation) return "unsupported";
  return null;
}
