import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  it('renders the app with Vite + React heading', () => {
    render(<App />)
    expect(screen.getByText('Vite + React')).toBeInTheDocument()
  })

  it('renders initial count of 0', () => {
    render(<App />)
    expect(screen.getByRole('button')).toHaveTextContent('count is 0')
  })

  it('increments count when button is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)
    const button = screen.getByRole('button')
    
    await user.click(button)
    expect(button).toHaveTextContent('count is 1')
    
    await user.click(button)
    expect(button).toHaveTextContent('count is 2')
  })
})
