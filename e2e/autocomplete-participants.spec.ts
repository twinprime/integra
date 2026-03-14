import { test, expect, type Page } from "@playwright/test"
import { loadAppWithFixture } from "./helpers/app"
import { getVisibleCodeMirrorEditor, openEditableTreeItem } from "./helpers/interactions"
import type { ComponentNode, SequenceDiagramNode, UseCaseDiagramNode, UseCaseNode } from "../src/store/types"

function makeAutocompleteFixture(): string {
  const nestedFlow: SequenceDiagramNode = {
    uuid: "autocomplete-seq-uuid",
    id: "NestedFlow",
    name: "Nested Flow",
    type: "sequence-diagram",
    ownerComponentUuid: "comp-a-uuid",
    referencedNodeIds: [],
    referencedFunctionUuids: [],
    content: "",
  }

  const nestedUseCase: UseCaseNode = {
    uuid: "autocomplete-uc-uuid",
    id: "ManageFlow",
    name: "Manage Flow",
    type: "use-case",
    sequenceDiagrams: [nestedFlow],
  }

  const nestedUcd: UseCaseDiagramNode = {
    uuid: "autocomplete-ucd-uuid",
    id: "NestedUCD",
    name: "Nested Use Cases",
    type: "use-case-diagram",
    ownerComponentUuid: "comp-a-uuid",
    referencedNodeIds: ["local-actor-uuid", "autocomplete-uc-uuid"],
    content: ["actor localUser", "use case ManageFlow", "localUser ->> ManageFlow"].join("\n"),
    useCases: [nestedUseCase],
  }

  const system: ComponentNode = {
    uuid: "root-uuid",
    id: "System",
    name: "System",
    type: "component",
    actors: [],
    interfaces: [],
    useCaseDiagrams: [],
    subComponents: [
      {
        uuid: "parent-uuid",
        id: "parent",
        name: "Parent",
        type: "component",
        actors: [],
        interfaces: [],
        useCaseDiagrams: [],
        subComponents: [
          {
            uuid: "comp-a-uuid",
            id: "compA",
            name: "compA",
            type: "component",
            actors: [{ uuid: "local-actor-uuid", id: "localUser", name: "localUser", type: "actor" }],
            interfaces: [],
            useCaseDiagrams: [nestedUcd],
            subComponents: [
              {
                uuid: "child-scope-uuid",
                id: "childScope",
                name: "childScope",
                type: "component",
                actors: [],
                interfaces: [],
                useCaseDiagrams: [],
                subComponents: [
                  {
                    uuid: "service-child-uuid",
                    id: "serviceChild",
                    name: "serviceChild",
                    type: "component",
                    actors: [],
                    interfaces: [],
                    useCaseDiagrams: [],
                    subComponents: [],
                  },
                ],
              },
            ],
          },
          {
            uuid: "comp-b-uuid",
            id: "compB",
            name: "compB",
            type: "component",
            actors: [],
            interfaces: [],
            useCaseDiagrams: [],
            subComponents: [],
          },
        ],
      },
      {
        uuid: "service-hub-uuid",
        id: "serviceHub",
        name: "serviceHub",
        type: "component",
        actors: [{ uuid: "platform-actor-uuid", id: "platformUser", name: "platformUser", type: "actor" }],
        interfaces: [],
        useCaseDiagrams: [],
        subComponents: [
          {
            uuid: "service-leaf-uuid",
            id: "serviceLeaf",
            name: "serviceLeaf",
            type: "component",
            actors: [],
            interfaces: [],
            useCaseDiagrams: [],
            subComponents: [],
          },
        ],
      },
    ],
  }

  return JSON.stringify({ state: { rootComponent: system }, version: 0 })
}

const completionLabels = async (page: Page): Promise<string[]> => {
  const dropdown = page.locator(".cm-tooltip-autocomplete")
  await expect(dropdown).toBeVisible({ timeout: 3000 })
  return dropdown.locator(".cm-completionLabel").allTextContents()
}

const chooseCompletion = async (page: Page, label: string): Promise<void> => {
  await page.locator(".cm-tooltip-autocomplete li").filter({ hasText: label }).first().click()
}

test.beforeEach(async ({ page }) => {
  await loadAppWithFixture(page, makeAutocompleteFixture())
  const cmEditor = await openEditableTreeItem(page, "Nested Flow")
  await expect(cmEditor).toBeVisible()
  await cmEditor.click()
})

test.describe("autocomplete participants and path suggestions", () => {
  test("actor suggestions include local and scoped external participants", async ({ page }) => {
    const cmEditor = await getVisibleCodeMirrorEditor(page)
    await cmEditor.type("actor ")

    const labels = await completionLabels(page)
    expect(labels).toContain("localUser (local)")
    expect(labels).toContain("platformUser (from serviceHub)")
  })

  test("component suggestions use relative descendant paths before tree-wide suggestions", async ({
    page,
  }) => {
    const cmEditor = await getVisibleCodeMirrorEditor(page)
    await cmEditor.type("component service")

    const labels = await completionLabels(page)
    const localIndex = labels.indexOf("serviceChild (local)")
    const externalIndex = labels.indexOf("serviceHub (from tree)")

    expect(localIndex).toBeGreaterThanOrEqual(0)
    expect(externalIndex).toBeGreaterThanOrEqual(0)
    expect(localIndex).toBeLessThan(externalIndex)

    await chooseCompletion(page, "serviceChild (local)")
    await expect(cmEditor).toContainText("component childScope/serviceChild")
  })

  test("component suggestions insert absolute paths with aliases for external nodes", async ({
    page,
  }) => {
    const cmEditor = await getVisibleCodeMirrorEditor(page)
    await cmEditor.type("component hub")

    const labels = await completionLabels(page)
    expect(labels).toContain("serviceHub (from tree)")

    await chooseCompletion(page, "serviceHub (from tree)")
    await expect(cmEditor).toContainText("component System/serviceHub as serviceHub")
  })
})
