// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const setTransform = vi.fn()
let latestWrapperProps: Record<string, unknown> = {}

const controls = {
  instance: {
    wrapperComponent: null as HTMLDivElement | null,
    contentComponent: null as HTMLDivElement | null,
  },
  setTransform,
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
}

vi.mock("react-zoom-pan-pinch", async () => {
  const React = await import("react")

  return {
    TransformWrapper: ({
      children,
      ...props
    }: {
      children: React.ReactNode
      [key: string]: unknown
    }) => {
      latestWrapperProps = props
      return <>{children}</>
    },
    TransformComponent: ({
      children,
      wrapperStyle,
      contentStyle,
    }: {
      children: React.ReactNode
      wrapperStyle?: React.CSSProperties
      contentStyle?: React.CSSProperties
    }) => {
      const wrapperRef = React.useRef<HTMLDivElement>(null)
      const contentRef = React.useRef<HTMLDivElement>(null)

      React.useLayoutEffect(() => {
        controls.instance.wrapperComponent = wrapperRef.current
        controls.instance.contentComponent = contentRef.current
      })

      return (
        <div ref={wrapperRef} data-testid="transform-wrapper" style={wrapperStyle}>
          <div ref={contentRef} data-testid="transform-content" style={contentStyle}>
            {children}
          </div>
        </div>
      )
    },
    useControls: () => controls,
  }
})

import { DiagramPanZoom } from "./DiagramPanZoom"

type ResizeObserverRecord = {
  callback: ResizeObserverCallback
  elements: Set<Element>
}

const resizeObservers: ResizeObserverRecord[] = []

class ResizeObserverMock {
  private readonly elements = new Set<Element>()

  constructor(callback: ResizeObserverCallback) {
    resizeObservers.push({ callback, elements: this.elements })
  }

  observe(element: Element) {
    this.elements.add(element)
  }

  unobserve(element: Element) {
    this.elements.delete(element)
  }

  disconnect() {
    this.elements.clear()
  }
}

function setElementSize(element: HTMLElement, width: number, height: number) {
  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    get: () => width,
  })
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    get: () => height,
  })
}

function triggerResize(element: Element) {
  resizeObservers
    .filter((observer) => observer.elements.has(element))
    .forEach((observer) => observer.callback([], {} as ResizeObserver))
}

describe("DiagramPanZoom", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resizeObservers.length = 0
    controls.instance.wrapperComponent = null
    controls.instance.contentComponent = null
    latestWrapperProps = {}
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not refit when only the diagram content size changes after mount", () => {
    const { rerender } = render(
      <DiagramPanZoom contentKey="diagram-a">
        <div data-testid="diagram-child" />
      </DiagramPanZoom>,
    )

    const wrapper = screen.getByTestId("transform-wrapper")
    const content = screen.getByTestId("transform-content")
    const child = screen.getByTestId("diagram-child")

    setElementSize(wrapper, 500, 300)
    setElementSize(content, 400, 200)
    setElementSize(child, 400, 200)

    act(() => {
      vi.advanceTimersByTime(60)
    })

    expect(setTransform).toHaveBeenCalledTimes(1)

    setTransform.mockClear()
    setElementSize(child, 420, 200)

    act(() => {
      triggerResize(content)
      vi.advanceTimersByTime(60)
    })

    expect(setTransform).not.toHaveBeenCalled()

    rerender(
      <DiagramPanZoom contentKey="diagram-a">
        <div data-testid="diagram-child" />
      </DiagramPanZoom>,
    )

    act(() => {
      vi.advanceTimersByTime(60)
    })

    expect(setTransform).not.toHaveBeenCalled()

    rerender(
      <DiagramPanZoom contentKey="diagram-b">
        <div data-testid="diagram-child" />
      </DiagramPanZoom>,
    )

    act(() => {
      vi.advanceTimersByTime(60)
    })

    expect(setTransform).toHaveBeenCalledTimes(1)
  })

  it("cancels pending auto-fit when the user zooms before the timer fires", () => {
    render(
      <DiagramPanZoom contentKey="diagram-a">
        <div data-testid="diagram-child" />
      </DiagramPanZoom>,
    )

    const wrapper = screen.getByTestId("transform-wrapper")
    const content = screen.getByTestId("transform-content")
    const child = screen.getByTestId("diagram-child")

    setElementSize(wrapper, 500, 300)
    setElementSize(content, 400, 200)
    setElementSize(child, 400, 200)

    act(() => {
      const onZoomStart = latestWrapperProps.onZoomStart as (() => void) | undefined
      onZoomStart?.()
      vi.advanceTimersByTime(60)
    })

    expect(setTransform).not.toHaveBeenCalled()
  })
})
