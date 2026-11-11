import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

const PLACEHOLDER = 'Press the button to get a cat fact.'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A fetch whose reply is released by the test, so the loading state can be observed. */
function deferredFetch() {
  let resolve!: (response: Response) => void
  const mock = vi.fn(() => new Promise<Response>((r) => (resolve = r)))
  vi.stubGlobal('fetch', mock)
  return { mock, reply: (response: Response) => resolve(response) }
}

describe('App', () => {
  it('test_initial__shows_button_and_placeholder_no_fetch', () => {
    const mock = vi.fn()
    vi.stubGlobal('fetch', mock)

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Cat facts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get a cat fact' })).toBeEnabled()
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument()
    expect(mock).not.toHaveBeenCalled()
  })

  it('test_click__disables_button_and_shows_loading_then_fact', async () => {
    const user = userEvent.setup()
    const { reply } = deferredFetch()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Get a cat fact' }))

    expect(screen.getByRole('button', { name: 'Get a cat fact' })).toBeDisabled()
    expect(screen.getByText('Fetching a cat fact…')).toBeInTheDocument()

    reply(jsonResponse(200, { fact: 'CATS PURR.' }))

    expect(await screen.findByText('CATS PURR.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get a cat fact' })).toBeEnabled()
    expect(screen.queryByText('Fetching a cat fact…')).not.toBeInTheDocument()
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
  })

  it('test_click_error__shows_error_notification_and_keeps_button_enabled', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(502, { error: 'Casual is not reachable' })))
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Get a cat fact' }))

    expect(await screen.findByText('Could not get a cat fact')).toBeInTheDocument()
    expect(screen.getByText('Casual is not reachable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get a cat fact' })).toBeEnabled()
  })

  it('test_second_click_after_error__clears_notification', async () => {
    const user = userEvent.setup()
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(502, { error: 'Casual is not reachable' }))
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', mock)
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Get a cat fact' }))
    expect(await screen.findByText('Casual is not reachable')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Get a cat fact' }))

    expect(screen.queryByText('Could not get a cat fact')).not.toBeInTheDocument()
    expect(screen.queryByText('Casual is not reachable')).not.toBeInTheDocument()
    expect(screen.getByText('Fetching a cat fact…')).toBeInTheDocument()
  })

  it('test_sequence_diagram_link__opens_modal_with_image_and_close_button_closes_it', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn())
    render(<App />)
    const modal = () => document.querySelector('.cds--modal')

    expect(modal()).not.toHaveClass('is-visible')

    await user.click(screen.getByRole('link', { name: 'Sequence Diagram' }))

    expect(modal()).toHaveClass('is-visible')
    expect(screen.getByAltText('Call sequence diagram')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(modal()).not.toHaveClass('is-visible')
  })
})
