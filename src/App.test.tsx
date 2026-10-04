import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import App from './App.tsx'

it('renders the app shell', () => {
  render(<App />)

  expect(screen.getByRole('heading', { name: 'MAX Chat' })).toBeInTheDocument()
})
