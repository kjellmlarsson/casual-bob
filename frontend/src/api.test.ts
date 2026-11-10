import { afterEach, describe, expect, it, vi } from 'vitest'
import { FactError, fetchFact } from './api'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl)
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('fetchFact', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('test_fetchFact_ok__returns_fact_text', async () => {
    const mock = stubFetch(async () => jsonResponse(200, { fact: 'CATS SLEEP A LOT.' }))

    await expect(fetchFact()).resolves.toBe('CATS SLEEP A LOT.')
    expect(mock).toHaveBeenCalledWith('/api/fact', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('test_fetchFact_502_with_error_body__throws_backend_message', async () => {
    stubFetch(async () => jsonResponse(502, { error: 'Casual is not reachable' }))

    await expect(fetchFact()).rejects.toThrow(new FactError('Casual is not reachable'))
  })

  it('test_fetchFact_504_with_error_body__throws_backend_message', async () => {
    stubFetch(async () => jsonResponse(504, { error: 'Casual did not reply in time' }))

    await expect(fetchFact()).rejects.toThrow(new FactError('Casual did not reply in time'))
  })

  it('test_fetchFact_html_error_page__throws_unavailable_with_status', async () => {
    stubFetch(async () => new Response('<html>Bad gateway</html>', { status: 503, headers: { 'Content-Type': 'text/html' } }))

    const error = await fetchFact().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(FactError)
    expect((error as FactError).message).toBe('The service is unavailable (HTTP 503).')
  })

  it('test_fetchFact_network_failure__throws_could_not_reach', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(fetchFact()).rejects.toThrow(new FactError('Could not reach the server.'))
  })

  it('test_fetchFact_no_reply__throws_timed_out', async () => {
    vi.useFakeTimers()
    stubFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )

    const result = fetchFact().catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(10_000)

    const error = await result
    expect(error).toBeInstanceOf(FactError)
    expect((error as FactError).message).toBe('The request timed out.')
  })

  it('test_fetchFact_missing_fact__throws_unexpected_reply', async () => {
    stubFetch(async () => jsonResponse(200, { other: 1 }))

    await expect(fetchFact()).rejects.toThrow(new FactError('The server returned an unexpected reply.'))
  })
})
