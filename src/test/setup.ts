// Polyfill ResizeObserver for jsdom (required by react-zoom-pan-pinch)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

import '@testing-library/jest-dom'
