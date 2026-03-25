// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
    afterEach(() => {
        window.history.replaceState({}, '', '/')
    })

    it('renders the packaged user guide view when requested from the URL', () => {
        window.history.replaceState({}, '', '/?view=user-guide')

        render(<App />)

        expect(
            screen.getByRole('heading', { name: 'Integra User Guide', level: 1 })
        ).toBeInTheDocument()
        expect(screen.getByText('Quick Start')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Open app' })).toHaveAttribute('href', '/')
    })
})
