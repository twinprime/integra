import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { useSystemStore, findNode } from "../store/useSystemStore"
import type { Node, DiagramNode, ComponentNode, InterfaceSpecification, InterfaceFunction, SequenceDiagramNode, UseCaseDiagramNode } from "../store/types"

const INTERFACE_TYPES = ["rest", "graphql", "kafka", "other"] as const

const CommonEditor = ({
  node,
  onUpdate,
}: {
  node: Node
  onUpdate: (updates: any) => void
}) => {
  const [name, setName] = useState(node.name || "")
  const [description, setDescription] = useState(node.description || "")

  useEffect(() => {
    setName(node.name || "")
    setDescription(node.description || "")
  }, [node.uuid, node.name, node.description])

  const handleNameBlur = () => {
    if (name !== node.name && name.trim() !== "") {
      onUpdate({ name: name.trim() })
    } else if (name.trim() === "") {
      setName(node.name)
    }
  }

  const handleDescriptionBlur = () => {
    if (description !== node.description) {
      onUpdate({ description })
    }
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-2">
          {node.name}
          <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
            {node.type}
          </span>
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          ID: <span className="font-mono text-gray-500">{node.id}</span>
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Name
        </label>
        <input
          className="w-full p-2 border border-gray-700 rounded-md text-sm text-gray-100 bg-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Description
        </label>
        <textarea
          className="w-full p-2 border border-gray-700 rounded-md text-sm text-gray-100 bg-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
        />
      </div>
    </div>
  )
}

/** Collect all referencedFunctionUuids from all sequence diagrams nested under a component */
function collectReferencedFunctionUuids(comp: ComponentNode): Set<string> {
  const uuids = new Set<string>()
  const visitComp = (c: ComponentNode) => {
    c.useCaseDiagrams.forEach((d: UseCaseDiagramNode) => {
      d.useCases.forEach((uc) => {
        uc.sequenceDiagrams.forEach((sd: SequenceDiagramNode) => {
          sd.referencedFunctionUuids?.forEach((u) => uuids.add(u))
        })
      })
    })
    c.subComponents.forEach(visitComp)
  }
  visitComp(comp)
  return uuids
}

const ComponentEditor = ({
  node,
  onUpdate,
}: {
  node: ComponentNode
  onUpdate: (updates: any) => void
}) => {
  const [name, setName] = useState(node.name || "")
  const [description, setDescription] = useState(node.description || "")

  useEffect(() => {
    setName(node.name || "")
    setDescription(node.description || "")
  }, [node.uuid, node.name, node.description])

  const handleNameBlur = () => {
    if (name !== node.name && name.trim() !== "") {
      onUpdate({ name: name.trim() })
    } else if (name.trim() === "") {
      setName(node.name)
    }
  }

  const handleDescriptionBlur = () => {
    if (description !== node.description) {
      onUpdate({ description })
    }
  }

  const referencedFunctionUuids = collectReferencedFunctionUuids(node)

  const handleInterfaceUpdate = (ifaceIdx: number, updates: Partial<InterfaceSpecification>) => {
    const newInterfaces = node.interfaces.map((iface, i) =>
      i === ifaceIdx ? { ...iface, ...updates } : iface
    )
    onUpdate({ interfaces: newInterfaces })
  }

  const handleFunctionUpdate = (ifaceIdx: number, fnIdx: number, updates: Partial<InterfaceFunction>) => {
    const newInterfaces = node.interfaces.map((iface, i) => {
      if (i !== ifaceIdx) return iface
      return {
        ...iface,
        functions: iface.functions.map((fn, j) =>
          j === fnIdx ? { ...fn, ...updates } : fn
        ),
      }
    })
    onUpdate({ interfaces: newInterfaces })
  }

  const handleDeleteFunction = (ifaceIdx: number, fnIdx: number) => {
    const newInterfaces = node.interfaces.map((iface, i) => {
      if (i !== ifaceIdx) return iface
      return {
        ...iface,
        functions: iface.functions.filter((_, j) => j !== fnIdx),
      }
    })
    onUpdate({ interfaces: newInterfaces })
  }

  const handleParamDescriptionUpdate = (
    ifaceIdx: number,
    fnIdx: number,
    paramIdx: number,
    description: string
  ) => {
    const newInterfaces = node.interfaces.map((iface, i) => {
      if (i !== ifaceIdx) return iface
      return {
        ...iface,
        functions: iface.functions.map((fn, j) => {
          if (j !== fnIdx) return fn
          return {
            ...fn,
            parameters: fn.parameters.map((p, k) =>
              k === paramIdx ? { ...p, description } : p
            ),
          }
        }),
      }
    })
    onUpdate({ interfaces: newInterfaces })
  }

  return (
    <div className="p-4 h-full flex flex-col overflow-y-auto">
      <div className="mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-2">
          {node.name}
          <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
            {node.type}
          </span>
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          ID: <span className="font-mono text-gray-500">{node.id}</span>
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Name
        </label>
        <input
          className="w-full p-2 border border-gray-700 rounded-md text-sm text-gray-100 bg-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Description
        </label>
        <textarea
          className="w-full p-2 border border-gray-700 rounded-md text-sm text-gray-100 bg-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
        />
      </div>

      {/* Interface Specifications Section */}
      {node.interfaces && node.interfaces.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            Interface Specifications
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
              {node.interfaces.length}
            </span>
          </h3>
          <div className="space-y-4">
            {node.interfaces.map((iface, ifaceIdx) => (
              <InterfaceEditor
                key={iface.uuid || iface.id}
                iface={iface}
                ifaceIdx={ifaceIdx}
                referencedFunctionUuids={referencedFunctionUuids}
                onInterfaceUpdate={(updates) => handleInterfaceUpdate(ifaceIdx, updates)}
                onFunctionUpdate={(fnIdx, updates) => handleFunctionUpdate(ifaceIdx, fnIdx, updates)}
                onDeleteFunction={(fnIdx) => handleDeleteFunction(ifaceIdx, fnIdx)}
                onParamDescriptionUpdate={(fnIdx, paramIdx, desc) =>
                  handleParamDescriptionUpdate(ifaceIdx, fnIdx, paramIdx, desc)
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const InterfaceEditor = ({
  iface,
  referencedFunctionUuids,
  onInterfaceUpdate,
  onFunctionUpdate,
  onDeleteFunction,
  onParamDescriptionUpdate,
}: {
  iface: InterfaceSpecification
  ifaceIdx: number
  referencedFunctionUuids: Set<string>
  onInterfaceUpdate: (updates: Partial<InterfaceSpecification>) => void
  onFunctionUpdate: (fnIdx: number, updates: Partial<InterfaceFunction>) => void
  onDeleteFunction: (fnIdx: number) => void
  onParamDescriptionUpdate: (fnIdx: number, paramIdx: number, desc: string) => void
}) => {
  const [name, setName] = useState(iface.name)
  const [description, setDescription] = useState(iface.description || "")

  useEffect(() => {
    setName(iface.name)
    setDescription(iface.description || "")
  }, [iface.uuid, iface.name, iface.description])

  return (
    <div className="border border-gray-700 rounded-md bg-gray-900/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <input
          className="flex-1 p-1 text-sm font-medium text-gray-200 bg-transparent border border-transparent rounded hover:border-gray-600 focus:border-blue-400 focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== iface.name && name.trim()) onInterfaceUpdate({ name: name.trim() })
          }}
        />
        <select
          className="text-xs text-gray-400 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 focus:outline-none focus:border-blue-400"
          value={iface.type}
          onChange={(e) => onInterfaceUpdate({ type: e.target.value as any })}
        >
          {INTERFACE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        ID: <span className="font-mono">{iface.id}</span>
      </p>
      <textarea
        className="w-full p-1 text-xs text-gray-400 bg-gray-950 border border-gray-800 rounded mb-3 focus:outline-none focus:border-blue-400 resize-none"
        rows={2}
        placeholder="Description..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => {
          if (description !== (iface.description || "")) onInterfaceUpdate({ description })
        }}
      />

      {iface.functions && iface.functions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400">
            Functions ({iface.functions.length})
          </p>
          {iface.functions.map((fn, fnIdx) => {
            const isUnreferenced = !referencedFunctionUuids.has(fn.uuid)
            return (
              <FunctionEditor
                key={fn.uuid || fn.id}
                fn={fn}
                fnIdx={fnIdx}
                isUnreferenced={isUnreferenced}
                onUpdate={(updates) => onFunctionUpdate(fnIdx, updates)}
                onDelete={() => onDeleteFunction(fnIdx)}
                onParamDescriptionUpdate={(paramIdx, desc) =>
                  onParamDescriptionUpdate(fnIdx, paramIdx, desc)
                }
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

const FunctionEditor = ({
  fn,
  isUnreferenced,
  onUpdate,
  onDelete,
  onParamDescriptionUpdate,
}: {
  fn: InterfaceFunction
  fnIdx: number
  isUnreferenced: boolean
  onUpdate: (updates: Partial<InterfaceFunction>) => void
  onDelete: () => void
  onParamDescriptionUpdate: (paramIdx: number, desc: string) => void
}) => {
  const [fnId, setFnId] = useState(fn.id)
  const [fnDescription, setFnDescription] = useState(fn.description || "")

  useEffect(() => {
    setFnId(fn.id)
    setFnDescription(fn.description || "")
  }, [fn.uuid, fn.id, fn.description])

  return (
    <div className="bg-gray-950 border border-gray-800 rounded p-2">
      <div className="flex items-center gap-2 mb-1">
        <input
          className={`text-sm font-mono flex-1 bg-transparent border-b border-transparent hover:border-gray-600 focus:border-blue-400 focus:outline-none ${isUnreferenced ? "line-through text-gray-500" : "text-blue-400"}`}
          value={fnId}
          onChange={(e) => setFnId(e.target.value)}
          onBlur={() => {
            if (fnId !== fn.id && fnId.trim()) onUpdate({ id: fnId.trim() })
          }}
        />
        {isUnreferenced && (
          <button
            className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-900/20"
            title="Delete unreferenced function"
            onClick={onDelete}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <textarea
        className="w-full p-1 text-xs text-gray-400 bg-gray-900 border border-gray-800 rounded mb-2 focus:outline-none focus:border-blue-400 resize-none"
        rows={1}
        placeholder="Function description..."
        value={fnDescription}
        onChange={(e) => setFnDescription(e.target.value)}
        onBlur={() => {
          if (fnDescription !== (fn.description || "")) onUpdate({ description: fnDescription })
        }}
      />
      {fn.parameters && fn.parameters.length > 0 && (
        <div className="mt-1">
          <p className="text-xs font-medium text-gray-500 mb-1">Parameters:</p>
          <div className="space-y-1">
            {fn.parameters.map((param, idx) => (
              <div key={idx} className="text-xs font-mono text-gray-400">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-gray-300">{param.name}</span>
                  <span className="text-gray-600">:</span>
                  <span className="text-green-400">{param.type}</span>
                  {!param.required && (
                    <span className="text-yellow-500 text-[0.65rem]">optional</span>
                  )}
                  {param.required && (
                    <span className="text-red-400 text-[0.65rem]">required</span>
                  )}
                </div>
                <input
                  className="mt-0.5 w-full text-[0.7rem] text-gray-500 bg-transparent border-b border-transparent hover:border-gray-700 focus:border-gray-600 focus:outline-none placeholder-gray-700"
                  placeholder="Parameter description..."
                  defaultValue={param.description || ""}
                  onBlur={(e) => {
                    if (e.target.value !== (param.description || "")) {
                      onParamDescriptionUpdate(idx, e.target.value)
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const DiagramEditor = ({
  node,
  onUpdate,
}: {
  node: DiagramNode
  onUpdate: (updates: any) => void
}) => {
  const [name, setName] = useState(node.name || "")
  const [content, setContent] = useState(node.content || "")

  useEffect(() => {
    setName(node.name || "")
    setContent(node.content || "")
  }, [node.uuid, node.name, node.content])

  const handleNameBlur = () => {
    if (name !== node.name && name.trim() !== "") {
      onUpdate({ name: name.trim() })
    } else if (name.trim() === "") {
      setName(node.name)
    }
  }

  const handleContentBlur = () => {
    if (content !== node.content) {
      onUpdate({ content })
    }
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-2">
          {node.name}
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          Usage:{" "}
          {node.type === "sequence-diagram"
            ? "Mermaid Sequence Syntax"
            : "Text / YAML"}
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Name
        </label>
        <input
          className="w-full p-2 border border-gray-700 rounded-md text-sm text-gray-100 bg-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
      </div>

      <div className="mb-4 flex-1 flex flex-col">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Specification
        </label>
        <textarea
          className="w-full p-2 border border-gray-700 rounded-md text-[0.85rem] font-mono text-gray-100 resize-y min-h-[200px] flex-1 bg-gray-950 leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={handleContentBlur}
          placeholder={
            node.type === "sequence-diagram"
              ? 'actor "User" as user\ncomponent "Service" as service\nuser->>service: ExplorationsAPI:createExploration(id: number)'
              : 'actor "User" as user\nuse case "Login" as login\nuser --> login'
          }
        />
      </div>
    </div>
  )
}

export const EditorPanel = () => {
  const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
  const rootComponent = useSystemStore((state) => state.rootComponent)
  const updateNode = useSystemStore((state) => state.updateNode)

  const selectedNode = selectedNodeId
    ? findNode([rootComponent], selectedNodeId)
    : null

  if (!selectedNode) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Select a node from the explorer to edit
      </div>
    )
  }

  const handleUpdate = (updates: any) => {
    updateNode(selectedNode.uuid, updates)
  }

  if (
    selectedNode.type === "use-case-diagram" ||
    selectedNode.type === "sequence-diagram"
  ) {
    return (
      <DiagramEditor
        node={selectedNode as DiagramNode}
        onUpdate={handleUpdate}
      />
    )
  }

  if (selectedNode.type === "component") {
    return (
      <ComponentEditor
        node={selectedNode as ComponentNode}
        onUpdate={handleUpdate}
      />
    )
  }

  return <CommonEditor node={selectedNode} onUpdate={handleUpdate} />
}
