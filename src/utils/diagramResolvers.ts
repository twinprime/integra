import type { ComponentNode } from "../store/types"
import { findNodeByPath } from "./nodeUtils"

export function resolveInOwner(
  ownerComp: ComponentNode,
  id: string,
): string | undefined {
  if (ownerComp.id === id) return ownerComp.uuid
  return (
    ownerComp.actors?.find((a) => a.id === id)?.uuid ??
    ownerComp.subComponents?.find((c) => c.id === id)?.uuid ??
    undefined
  )
}

export function resolveUseCaseInOwner(
  ownerComp: ComponentNode,
  id: string,
): string | undefined {
  for (const d of ownerComp.useCaseDiagrams) {
    const uc = d.useCases?.find((u) => u.id === id)
    if (uc) return uc.uuid
  }
  return undefined
}

export function resolveParticipant(
  keyword: string,
  id: string,
  fromPath: string | undefined,
  root: ComponentNode,
  ownerComp: ComponentNode | null,
): string | undefined {
  if (fromPath) return findNodeByPath(root, fromPath) ?? undefined
  if (!ownerComp) return undefined
  if (keyword.startsWith("use")) {
    return resolveUseCaseInOwner(ownerComp, id) ?? resolveInOwner(ownerComp, id)
  }
  return resolveInOwner(ownerComp, id)
}
