import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SequenceLinkTooltip } from './SequenceLinkTooltip'

describe('SequenceLinkTooltip', () => {
    it('renders nothing when info is null', () => {
        const { container } = render(
            <SequenceLinkTooltip info={null} position={{ x: 100, y: 200 }} />
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing when position is null', () => {
        const { container } = render(
            <SequenceLinkTooltip
                info={{ entityType: 'Use Case', entityName: 'Checkout' }}
                position={null}
            />
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('renders entity type and name when both props are provided', () => {
        const { getByText } = render(
            <SequenceLinkTooltip
                info={{ entityType: 'Use Case', entityName: 'Checkout' }}
                position={{ x: 100, y: 200 }}
            />
        )
        expect(getByText('Use Case')).toBeInTheDocument()
        expect(getByText('Checkout')).toBeInTheDocument()
    })

    it('applies pointer-events-none to prevent blocking SVG mouse events', () => {
        const { container } = render(
            <SequenceLinkTooltip
                info={{ entityType: 'Function', entityName: 'PaymentService' }}
                position={{ x: 50, y: 80 }}
            />
        )
        const tooltip = container.firstElementChild
        expect(tooltip?.classList.contains('pointer-events-none')).toBe(true)
    })
})
