type MaybeAsyncHandler<Args extends unknown[]> = (
  ...args: Args
) => void | Promise<void>;

/** Implements the report unhandled event failure operation. */
function reportUnhandledEventFailure(): void {
  // Do not log the rejection object: UI errors can contain response details.
  console.error("An async UI action failed unexpectedly.");
}

/**
 * Invoke a React-style callback from a synchronous DOM event boundary while
 * ensuring a returned promise can never become an unhandled rejection.
 */
export function runEventHandler<Args extends unknown[]>(
  handler: MaybeAsyncHandler<Args>,
  ...args: Args
): void {
  try {
    const result = handler(...args);
    if (result) {
      void result.catch(reportUnhandledEventFailure);
    }
  } catch {
    reportUnhandledEventFailure();
  }
}
