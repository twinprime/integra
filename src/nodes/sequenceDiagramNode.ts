import type {
  SequenceDiagramNode,
  Parameter,
} from "../store/types"
import { updateDescriptionRefs } from "../utils/renameNodeId"
import { renameInSeqSpec } from "../parser/sequenceDiagram/specSerializer"
import { paramsToString } from "../parser/sequenceDiagram/systemUpdater"

export const applyIdRenameInSeqDiag = (
  sd: SequenceDiagramNode,
  targetUuid: string,
  oldId: string,
  newId: string,
): SequenceDiagramNode => ({
  ...sd,
  id: sd.uuid === targetUuid ? newId : sd.id,
  description: sd.description
    ? updateDescriptionRefs(sd.description, oldId, newId)
    : sd.description,
  content: renameInSeqSpec(sd.content, oldId, newId),
})

export const replaceSignatureInContent = (
  content: string,
  interfaceId: string,
  functionId: string,
  newParams: Parameter[],
): string => {
  const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(
    `(${escape(interfaceId)}:${escape(functionId)}\\()[^)]*\\)`,
    "g",
  )
  return content.replace(pattern, `${interfaceId}:${functionId}(${paramsToString(newParams)})`)
}

export { updateDescriptionRefs }
