// Polyfill ResizeObserver for jsdom (required by react-zoom-pan-pinch)
globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

import '@testing-library/jest-dom'
