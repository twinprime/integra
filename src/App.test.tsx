// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
    afterEach(() => {
        window.history.replaceState({}, '', '/')
    })

    it('renders the packaged developer guide view when requested from the URL', () => {
        window.history.replaceState({}, '', '/?view=developer-guide')

        render(<App />)

        expect(
            screen.getByRole('heading', { name: 'Developer Guide', level: 1 })
        ).toBeInTheDocument()
        expect(screen.getByText('Model Invariants')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Open app' })).toHaveAttribute('href', '/')
    })
})
