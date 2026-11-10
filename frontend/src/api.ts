const TIMEOUT_MS = 10_000

/** An error whose message can be shown to the user as is. */
export class FactError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FactError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Calls `GET /api/fact` and returns the fact text.
 *
 * Throws {@link FactError} with a user-readable message on failure. If the caller's
 * `signal` aborts, the abort error is rethrown unchanged.
 */
export async function fetchFact(signal?: AbortSignal): Promise<string> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, TIMEOUT_MS)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort)
  if (signal?.aborted) {
    abort()
  }

  try {
    const response = await fetch('/api/fact', { signal: controller.signal })
    // A body that is not JSON (for example an HTML error page) is treated as absent.
    const body: unknown = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) {
        throw error
      }
      return undefined
    })

    if ((response.status === 502 || response.status === 504) && isRecord(body) && typeof body.error === 'string') {
      throw new FactError(body.error)
    }
    if (response.status !== 200 || !isRecord(body)) {
      throw new FactError(`The service is unavailable (HTTP ${response.status}).`)
    }
    if (typeof body.fact !== 'string') {
      throw new FactError('The server returned an unexpected reply.')
    }
    return body.fact
  } catch (error) {
    if (error instanceof FactError) {
      throw error
    }
    if (timedOut) {
      throw new FactError('The request timed out.')
    }
    if (signal?.aborted) {
      throw error
    }
    throw new FactError('Could not reach the server.')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
