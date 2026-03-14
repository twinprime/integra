import type { ComponentNode } from "../../src/store/types"
import { sampleSystem } from "./sample-system"

function cloneSystem(): ComponentNode {
  return JSON.parse(JSON.stringify(sampleSystem)) as ComponentNode
}

export function makeMarkdownLayoutStorageValue(): string {
  const rootComponent = cloneSystem()

  const userActor = rootComponent.actors.find((actor) => actor.id === "User")
  if (userActor) {
    userActor.description = [
      "Jump to [OrderService](OrderService).",
      "",
      "Then inspect [Login Flow](MainUCD/Login/LoginFlow).",
    ].join("\n")
  }

  return JSON.stringify({ state: { rootComponent }, version: 0 })
}
