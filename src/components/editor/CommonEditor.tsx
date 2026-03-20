import { useState } from 'react'
import type { Node } from '../../store/types'
import { useSystemStore } from '../../store/useSystemStore'
import { getNodeSiblingIds } from '../../nodes/nodeTree'
import { findReferencingDiagrams } from '../../utils/nodeUtils'
import { DescriptionField } from './DescriptionField'
import { NodeReferencesButton } from './NodeReferencesButton'
import { NodePathEditorRow } from './NodePathEditorRow'
import { PanelTitleInput } from './PanelTitleInput'

const ID_FORMAT = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export const CommonEditor = ({
    node,
    onUpdate,
    contextComponentUuid,
}: {
    node: Node
    onUpdate: (updates: Partial<Node>) => void
    contextComponentUuid?: string
}) => {
    const [name, setName] = useState(node.name || '')
    const [description, setDescription] = useState(node.description || '')
    const [localId, setLocalId] = useState(node.id)
    const [idError, setIdError] = useState<string | null>(null)

    const rootComponent = useSystemStore((s) => s.rootComponent)
    const renameNodeId = useSystemStore((s) => s.renameNodeId)
    const referencingDiagrams = findReferencingDiagrams(rootComponent, node.uuid)

    const handleNameBlur = () => {
        if (name !== node.name && name.trim() !== '') {
            onUpdate({ name: name.trim() })
        } else if (name.trim() === '') {
            setName(node.name)
        }
    }

    const handleDescriptionBlur = () => {
        if (description !== node.description) {
            onUpdate({ description })
        }
    }

    const handleIdChange = (value: string) => {
        setLocalId(value)
        if (!value) {
            setIdError('ID cannot be empty')
        } else if (!ID_FORMAT.test(value)) {
            setIdError('ID must start with a letter or _ and contain only letters, digits, or _')
        } else {
            setIdError(null)
        }
    }

    const handleIdBlur = () => {
        const trimmed = localId.trim()
        if (!trimmed || idError || trimmed === node.id) {
            setLocalId(node.id)
            setIdError(null)
            return
        }
        const siblings = getNodeSiblingIds(rootComponent, node.uuid)
        if (siblings.includes(trimmed)) {
            setIdError(`ID "${trimmed}" is already used by a sibling node`)
            return
        }
        renameNodeId(node.uuid, trimmed)
    }

    return (
        <div className="p-4 h-full flex flex-col">
            <div className="mb-6 border-b border-gray-800 pb-4">
                <PanelTitleInput
                    value={name}
                    nodeType={node.type}
                    onChange={setName}
                    onBlur={handleNameBlur}
                />
                <NodePathEditorRow
                    nodeUuid={node.uuid}
                    localId={localId}
                    idError={idError}
                    onIdChange={handleIdChange}
                    onIdBlur={handleIdBlur}
                    trailingContent={<NodeReferencesButton refs={referencingDiagrams} />}
                />
            </div>

            <div className="flex-1 flex flex-col min-h-0">
                <DescriptionField
                    value={description}
                    onChange={setDescription}
                    onBlur={handleDescriptionBlur}
                    height="100%"
                    className="flex-1 min-h-0"
                    placeholder="Add a description..."
                    contextComponentUuid={contextComponentUuid}
                />
            </div>
        </div>
    )
}
