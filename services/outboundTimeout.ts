// A12: bound every outbound call to a third-party provider so a hung
// connection reads as a failed send (caller's existing failure path) instead
// of eating the whole function's execution budget.
export class OutboundTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} did not settle within ${timeoutMs}ms`);
    this.name = 'OutboundTimeoutError';
  }
}

export function withOutboundTimeout<T>(
  promise: Promise<T>,
  operation: string,
  timeoutMs = 10_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new OutboundTimeoutError(operation, timeoutMs)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
