import { test, expect, type Page } from "@playwright/test"
import {
  makeLocalStorageValue,
  makeLocalStorageValueWithBlockOnlyCall,
  makeLocalStorageValueWithDependency,
  makeLocalStorageValueWithDependencyOnlyComponent,
  makeLocalStorageValueWithInheritance,
} from "./fixtures/sample-system"
import { loadAppWithFixture } from "./helpers/app"
import type { ComponentNode, SequenceDiagramNode, UseCaseDiagramNode, UseCaseNode } from "../src/store/types"

// ─── Shared helper ────────────────────────────────────────────────────────────

function runClassDiagramTests(selectNode: (page: Page) => Promise<void>) {
  test("class diagram contains an SVG", async ({ page }) => {
    await selectNode(page)
    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })
    await expect(svgContainer.locator("svg")).toBeVisible()
  })

  test("class diagram SVG has non-trivial content", async ({ page }) => {
    await selectNode(page)
    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })

    const svgHeight = await svgContainer.locator("svg").evaluate((el) => el.getBoundingClientRect().height)
    expect(svgHeight).toBeGreaterThan(10)

    const classNodes = svgContainer.locator(".classGroup, .node, g.classBox")
    expect(await classNodes.count()).toBeGreaterThan(0)
  })

  test("no mermaid error banner is shown", async ({ page }) => {
    await selectNode(page)
    await page.waitForTimeout(2000)
    const errorBanner = page.locator("text=Parse error").or(page.locator("text=Invalid Diagram"))
    await expect(errorBanner).not.toBeVisible()
  })
}

async function getDiagramTransform(svgContainer: ReturnType<Page["locator"]>): Promise<string> {
  return svgContainer.locator("xpath=ancestor::*[contains(@class,'react-transform-component')][1]").evaluate((el) => {
    return (el as HTMLElement).style.transform
  })
}

// ─── Component node ───────────────────────────────────────────────────────────

test.describe("component class diagram", () => {
  test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")
  })

  runClassDiagramTests((page) =>
    page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()
  )
})

// ─── Use-case node ────────────────────────────────────────────────────────────

test.describe("use case class diagram", () => {
  test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")
  })

  runClassDiagramTests((page) =>
    page.getByRole("treeitem").filter({ hasText: "Login" }).first().click()
  )
})

test.describe("root class diagram", () => {
  test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")
  })

  runClassDiagramTests((page) =>
    page.getByRole("treeitem").filter({ hasText: /^System$/ }).first().click()
  )

  test("shows direct child components and referenced interface content", async ({ page }) => {
    await page.getByRole("treeitem").filter({ hasText: /^System$/ }).first().click()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })

    await expect(svgContainer).toContainText("AuthService")
    await expect(svgContainer).toContainText("OrderService")
    await expect(svgContainer).toContainText("IAuth")
    await expect(svgContainer).toContainText("login")
  })
})

// ─── Block message support ────────────────────────────────────────────────────

test.describe("component class diagram — block message support", () => {
  test("includes callers from inside opt blocks in the diagram", async ({ page }) => {
    const lsValue = makeLocalStorageValueWithBlockOnlyCall()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")

    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })
    await expect(svgContainer.locator("svg")).toBeVisible()

    const classNodes = svgContainer.locator(".classGroup, .node, g.classBox")
    expect(await classNodes.count()).toBeGreaterThan(1)
  })
})

// ─── Dependency arrows ────────────────────────────────────────────────────────

test.describe("component class diagram — dependency arrows", () => {
  test("shows outgoing dependency components and interfaces when component calls another", async ({ page }) => {
    const lsValue = makeLocalStorageValueWithDependency()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")

    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })
    await expect(svgContainer.locator("svg")).toBeVisible()

    const classNodes = svgContainer.locator(".classGroup, .node, g.classBox")
    expect(await classNodes.count()).toBeGreaterThan(2)
  })

  test("shows dependency component and interface details in the rendered diagram", async ({ page }) => {
    await loadAppWithFixture(page, makeLocalStorageValueWithDependency())
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })

    await expect(svgContainer).toContainText("AuthService")
    await expect(svgContainer).toContainText("OrderService")
    await expect(svgContainer).toContainText("IOrder")
    await expect(svgContainer).toContainText("process")
  })

  test("renders a dependency-only component diagram even when the component has no interfaces", async ({ page }) => {
    const lsValue = makeLocalStorageValueWithDependencyOnlyComponent()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")

    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()

    await expect(page.getByText("No interfaces defined for this component")).not.toBeVisible()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })
    await expect(svgContainer.locator("svg")).toBeVisible()

    const classNodes = svgContainer.locator(".classGroup, .node, g.classBox")
    expect(await classNodes.count()).toBeGreaterThan(2)
  })

  test("preserves manual zoom when hovering a dependency link", async ({ page }) => {
    await loadAppWithFixture(page, makeLocalStorageValueWithDependency())
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })
    await expect(svgContainer.locator("svg")).toBeVisible()
    await page.waitForTimeout(200)
    const svgBox = await svgContainer.boundingBox()
    expect(svgBox).not.toBeNull()

    const initialTransform = await getDiagramTransform(svgContainer)
    await page.mouse.move(svgBox!.x + svgBox!.width / 2, svgBox!.y + svgBox!.height / 2)
    await page.mouse.wheel(0, -600)
    await page.waitForTimeout(200)

    const zoomedTransform = await getDiagramTransform(svgContainer)
    expect(zoomedTransform).not.toBe(initialTransform)

    const dependencyHitTarget = page.locator('[data-integra-edge-hit-target="true"]').first()
    const hitTargetBox = await dependencyHitTarget.boundingBox()
    expect(hitTargetBox).not.toBeNull()
    await dependencyHitTarget.dispatchEvent("mousemove", {
      bubbles: true,
      clientX: hitTargetBox!.x + hitTargetBox!.width / 2,
      clientY: hitTargetBox!.y + hitTargetBox!.height / 2,
    })

    await expect(page.getByText("Derived from sequence diagrams")).toBeVisible()
    await expect(page.getByText("Auth To Order")).toBeVisible()

    expect(await getDiagramTransform(svgContainer)).toBe(zoomedTransform)
  })
})

test.describe("component class diagram — inherited interface rendering", () => {
  test("renders inherited interfaces with parent functions", async ({ page }) => {
    await loadAppWithFixture(page, makeLocalStorageValueWithInheritance())
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })

    await expect(svgContainer).toContainText("IAuthDerived")
    await expect(svgContainer).toContainText("doThing")
  })
})

function makeScopedClassDiagramFixture(): string {
  const sequenceDiagram: SequenceDiagramNode = {
    uuid: "scope-seq-uuid",
    id: "ScopedFlow",
    name: "Scoped Flow",
    type: "sequence-diagram",
    ownerComponentUuid: "scope-comp-a-uuid",
    referencedNodeIds: ["scope-comp-a-uuid", "scope-comp-b-uuid", "scope-platform-child-uuid"],
    referencedFunctionUuids: ["scope-own-fn-uuid", "scope-platform-fn-uuid"],
    content: [
      "component compA",
      "component parent/compB as compB",
      "component platform/platformChild as platformChild",
      "compB ->> compA: IFoo:doSomething(id: string)",
      "compA ->> platformChild: IPlatformChild:handleChild(value: string)",
    ].join("\n"),
  }

  const useCase: UseCaseNode = {
    uuid: "scope-uc-uuid",
    id: "ScopedUseCase",
    name: "Scoped Use Case",
    type: "use-case",
    sequenceDiagrams: [sequenceDiagram],
  }

  const useCaseDiagram: UseCaseDiagramNode = {
    uuid: "scope-ucd-uuid",
    id: "ScopedUCD",
    name: "Scoped Use Cases",
    type: "use-case-diagram",
    ownerComponentUuid: "scope-comp-a-uuid",
    referencedNodeIds: ["scope-uc-uuid"],
    content: "use case ScopedUseCase",
    useCases: [useCase],
  }

  const system: ComponentNode = {
    uuid: "scope-root-uuid",
    id: "System",
    name: "System",
    type: "component",
    actors: [],
    interfaces: [],
    useCaseDiagrams: [],
    subComponents: [
      {
        uuid: "scope-parent-uuid",
        id: "parent",
        name: "parent",
        type: "component",
        actors: [],
        interfaces: [],
        useCaseDiagrams: [],
        subComponents: [
          {
            uuid: "scope-comp-a-uuid",
            id: "compA",
            name: "compA",
            type: "component",
            actors: [],
            useCaseDiagrams: [useCaseDiagram],
            interfaces: [
              {
                uuid: "scope-own-iface-uuid",
                id: "IFoo",
                name: "IFoo",
                type: "rest",
                functions: [
                  {
                    uuid: "scope-own-fn-uuid",
                    id: "doSomething",
                    parameters: [{ name: "id", type: "string", required: true }],
                  },
                ],
              },
            ],
            subComponents: [],
          },
          {
            uuid: "scope-comp-b-uuid",
            id: "compB",
            name: "compB",
            type: "component",
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
            subComponents: [],
          },
        ],
      },
      {
        uuid: "scope-platform-uuid",
        id: "platform",
        name: "platform",
        type: "component",
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
        subComponents: [
          {
            uuid: "scope-platform-child-uuid",
            id: "platformChild",
            name: "platformChild",
            type: "component",
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
              {
                uuid: "scope-platform-iface-uuid",
                id: "IPlatformChild",
                name: "IPlatformChild",
                type: "rest",
                functions: [
                  {
                    uuid: "scope-platform-fn-uuid",
                    id: "handleChild",
                    parameters: [{ name: "value", type: "string", required: true }],
                  },
                ],
              },
            ],
            subComponents: [],
          },
        ],
      },
    ],
  }

  return JSON.stringify({ state: { rootComponent: system }, version: 0 })
}

test.describe("component class diagram — scoped sibling visibility", () => {
  test("keeps direct sibling callers visible but excludes descendant nodes of a sibling branch", async ({
    page,
  }) => {
    await loadAppWithFixture(page, makeScopedClassDiagramFixture())
    await page.getByRole("treeitem").filter({ hasText: /^compA$/ }).first().click()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })

    await expect(svgContainer).toContainText("compB")
    await expect(svgContainer).not.toContainText("platformChild")
    await expect(svgContainer).not.toContainText("IPlatformChild")
  })
})
