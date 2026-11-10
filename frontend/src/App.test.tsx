import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('test_smoke__renders_button', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Get a cat fact' })).toBeInTheDocument()
  })
})
