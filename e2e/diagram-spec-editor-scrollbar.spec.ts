import { test, expect } from "@playwright/test"
import type {
  ComponentNode,
  SequenceDiagramNode,
  UseCaseNode,
  UseCaseDiagramNode,
} from "../src/store/types"

// A sequence diagram with enough lines to overflow a bounded editor container
const LONG_CONTENT = Array.from({ length: 40 }, (_, i) =>
  i % 2 === 0
    ? `actor User${i}`
    : `component Service${i}`,
).join("\n")

function makeLocalStorageValue(): string {
  const seqDiagram: SequenceDiagramNode = {
    uuid: "scroll-seq-uuid",
    id: "LongFlow",
    name: "Long Flow",
    type: "sequence-diagram",
    ownerComponentUuid: "scroll-root-uuid",
    referencedNodeIds: [],
    referencedFunctionUuids: [],
    content: LONG_CONTENT,
  }

  const ucNode: UseCaseNode = {
    uuid: "scroll-uc-uuid",
    id: "LongUC",
    name: "Long UC",
    type: "use-case",
    sequenceDiagrams: [seqDiagram],
  }

  const ucDiagram: UseCaseDiagramNode = {
    uuid: "scroll-ucd-uuid",
    id: "LongUCD",
    name: "Long UCD",
    type: "use-case-diagram",
    ownerComponentUuid: "scroll-root-uuid",
    referencedNodeIds: [],
    content: "",
    useCases: [ucNode],
  }

  const rootComponent: ComponentNode = {
    uuid: "scroll-root-uuid",
    id: "System",
    name: "System",
    type: "component",
    subComponents: [],
    actors: [],
    useCaseDiagrams: [ucDiagram],
    interfaces: [],
  }

  return JSON.stringify({ state: { rootComponent }, version: 0 })
}

test.describe("diagram spec editor — preview mode scrollbar", () => {
  test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")
    await page.getByRole("treeitem").filter({ hasText: "Long Flow" }).click()
    await page.getByRole("button", { name: /diagram specification/i }).waitFor()
  })

  test("preview container has overflow-auto when content is present", async ({ page }) => {
    const preview = page.getByRole("button", { name: /diagram specification/i })
    const overflow = await preview.evaluate((el) => getComputedStyle(el).overflow)
    expect(overflow).toBe("auto")
  })

  test("preview container is scrollable when content overflows", async ({ page }) => {
    const cmScroller = page.locator(".cm-scroller").first()
    const isOverflowing = await cmScroller.evaluate(
      (el) => el.scrollHeight > el.clientHeight,
    )
    expect(isOverflowing).toBe(true)
  })

  test("switching to edit mode replaces preview with CodeMirror editor", async ({ page }) => {
    const preview = page.getByRole("button", { name: /diagram specification/i })

    // Confirm we start in preview mode with overflow:auto
    const previewOverflow = await preview.evaluate((el) => getComputedStyle(el).overflowY)
    expect(previewOverflow).toBe("auto")

    // Click to enter edit mode — preview button disappears, CM editor appears
    await preview.click()
    await expect(preview).not.toBeVisible()

    // CodeMirror renders a contenteditable editor (no textarea)
    const cmEditor = page.locator(".cm-editor")
    await expect(cmEditor).toBeVisible()

    // The edit container wrapping the CM editor uses overflow:hidden
    const editWrapper = page.locator("[data-testid='cm-editor-container']").locator("..")
    const editOverflow = await editWrapper.evaluate((el) => getComputedStyle(el).overflow)
    expect(editOverflow).toBe("hidden")
  })
})
