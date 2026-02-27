import type { ComponentNode } from "../../store/types"
import { useSystemStore, findNode } from "../../store/useSystemStore"
import { findNodeByPath } from "../../utils/nodeUtils"

type Seg = { text: string; cls: string; uuid?: string }
const seg = (text: string, cls: string, uuid?: string): Seg => ({ text, cls, uuid })

// ─── helpers ─────────────────────────────────────────────────────────────────

function findOwnerComponent(
  root: ComponentNode,
  uuid: string,
): ComponentNode | null {
  const node = findNode([root], uuid)
  return node?.type === "component" ? (node as ComponentNode) : null
}

function findComponentByInterfaceId(
  root: ComponentNode,
  ifaceId: string,
): string | undefined {
  if (root.interfaces?.some((i) => i.id === ifaceId)) return root.uuid
  for (const sub of root.subComponents) {
    const found = findComponentByInterfaceId(sub, ifaceId)
    if (found) return found
  }
  return undefined
}

function resolveInOwner(
  ownerComp: ComponentNode,
  id: string,
): string | undefined {
  return (
    ownerComp.actors?.find((a) => a.id === id)?.uuid ??
    ownerComp.subComponents?.find((c) => c.id === id)?.uuid ??
    undefined
  )
}

function resolveUseCaseInOwner(
  ownerComp: ComponentNode,
  id: string,
): string | undefined {
  for (const d of ownerComp.useCaseDiagrams) {
    const uc = d.useCases?.find((u) => u.id === id)
    if (uc) return uc.uuid
  }
  return undefined
}

function resolveParticipant(
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

// ─── regex patterns ───────────────────────────────────────────────────────────

// Handles: actor "Name" [from path] as id
//          component "Name" [from path] as id
//          use case "Name" [from path] as id
const RX_PART_NAMED =
  /^(\s*)(actor|component|use\s+case)(\s+"[^"]*")(\s+from\s+([\w/-]+))?(\s+as\s+)(\w+)(.*)/
// Handles: actor id   /  component id  (bare, no quotes)
const RX_PART_BARE = /^(\s*)(actor|component)(\s+)(\w+)(.*)/
// Sequence message: sender->>receiver: InterfaceId:functionId(params)
const RX_SEQ_MSG =
  /^(\s*)(\w+)(\s*->>\s*)(\w+)(\s*:\s*)(\w+):(\w+)(\([^)]*\))(.*)/
// Use-case relation: id --> id  /  id -->> id
const RX_UC_REL = /^(\s*)(\w+)(\s+--?>>?\s+)(\w+)(.*)/

// ─── participant map ──────────────────────────────────────────────────────────

function buildParticipantMap(
  lines: string[],
  root: ComponentNode,
  ownerComp: ComponentNode | null,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of lines) {
    const named = RX_PART_NAMED.exec(line)
    if (named) {
      const keyword = named[2]
      const fromPath = named[5]
      const id = named[7]
      const uuid = resolveParticipant(keyword, id, fromPath, root, ownerComp)
      if (uuid) map.set(id, uuid)
      continue
    }
    const bare = RX_PART_BARE.exec(line)
    if (bare) {
      const id = bare[4]
      const uuid = ownerComp ? resolveInOwner(ownerComp, id) : undefined
      if (uuid) map.set(id, uuid)
    }
  }
  return map
}

// ─── line tokenizer ───────────────────────────────────────────────────────────

function tokenizeLine(
  line: string,
  diagramType: "sequence-diagram" | "use-case-diagram",
  participantMap: Map<string, string>,
  root: ComponentNode,
  ownerComp: ComponentNode | null,
): Seg[] {
  // Named participant declaration
  const named = RX_PART_NAMED.exec(line)
  if (named) {
    const [, indent, keyword, name, fromClause, fromPath, asKw, id, rest] =
      named
    const uuid = resolveParticipant(keyword, id, fromPath, root, ownerComp)
    return [
      seg(indent, ""),
      seg(keyword, "text-purple-400"),
      seg(name, "text-yellow-300"),
      ...(fromClause ? [seg(fromClause, "text-gray-400")] : []),
      seg(asKw, "text-gray-400"),
      seg(id, "text-blue-400", uuid),
      seg(rest, "text-gray-300"),
    ]
  }

  // Bare participant declaration (sequence only)
  if (diagramType === "sequence-diagram") {
    const bare = RX_PART_BARE.exec(line)
    if (bare) {
      const [, indent, keyword, space, id, rest] = bare
      const uuid = ownerComp ? resolveInOwner(ownerComp, id) : undefined
      return [
        seg(indent, ""),
        seg(keyword, "text-purple-400"),
        seg(space, ""),
        seg(id, "text-blue-400", uuid),
        seg(rest, "text-gray-300"),
      ]
    }

    // Message line: sender->>receiver: InterfaceId:functionId(params)
    const msg = RX_SEQ_MSG.exec(line)
    if (msg) {
      const [, indent, sender, arrow, receiver, colon, ifaceId, fnId, params, rest] = msg
      return [
        seg(indent, ""),
        seg(sender, "text-blue-400", participantMap.get(sender)),
        seg(arrow, "text-gray-400"),
        seg(receiver, "text-blue-400", participantMap.get(receiver)),
        seg(colon, "text-gray-400"),
        seg(
          `${ifaceId}:${fnId}`,
          "text-green-400",
          findComponentByInterfaceId(root, ifaceId),
        ),
        seg(params, "text-gray-300"),
        seg(rest, "text-gray-300"),
      ]
    }
  }

  // Use-case relation: id --> id
  if (diagramType === "use-case-diagram") {
    const rel = RX_UC_REL.exec(line)
    if (rel) {
      const [, indent, from, arrow, to, rest] = rel
      return [
        seg(indent, ""),
        seg(from, "text-blue-400", participantMap.get(from)),
        seg(arrow, "text-gray-400"),
        seg(to, "text-blue-400", participantMap.get(to)),
        seg(rest, "text-gray-300"),
      ]
    }
  }

  return [seg(line, "text-gray-300")]
}

// ─── component ────────────────────────────────────────────────────────────────

type Props = {
  content: string
  rootComponent: ComponentNode
  ownerComponentUuid: string
  diagramType: "sequence-diagram" | "use-case-diagram"
  onClick?: () => void
  /** "backdrop": non-interactive, used behind a transparent textarea for edit-mode highlighting */
  mode?: "interactive" | "backdrop"
}

function TokenRow({
  tokens,
  interactive,
  onNavigate,
}: {
  tokens: Seg[]
  interactive: boolean
  onNavigate: (uuid: string) => void
}) {
  return (
    <div className="whitespace-pre min-h-[1.5em]">
      {tokens.map((t, j) =>
        t.uuid && interactive ? (
          <button
            key={j}
            type="button"
            className={`${t.cls} hover:underline focus:outline-none`}
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(t.uuid!)
            }}
          >
            {t.text}
          </button>
        ) : (
          <span key={j} className={t.cls}>
            {t.text}
          </span>
        ),
      )}
    </div>
  )
}

export function DiagramSpecPreview({
  content,
  rootComponent,
  ownerComponentUuid,
  diagramType,
  onClick,
  mode = "interactive",
}: Props) {
  const { selectNode } = useSystemStore()
  const ownerComp = findOwnerComponent(rootComponent, ownerComponentUuid)
  const interactive = mode === "interactive"

  if (!content.trim()) {
    if (!interactive) return null
    return (
      <div
        role="button"
        tabIndex={0}
        className="w-full p-2 border border-dashed border-gray-700 rounded-md text-sm text-gray-400 cursor-text min-h-[200px] flex-1 flex items-center justify-center italic hover:border-gray-600"
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick?.() }}
        aria-label="Click to edit specification"
      >
        Click to edit specification…
      </div>
    )
  }

  const lines = content.split("\n")
  const participantMap = buildParticipantMap(lines, rootComponent, ownerComp)
  const rows = lines.map((line) =>
    tokenizeLine(line, diagramType, participantMap, rootComponent, ownerComp),
  )

  if (!interactive) {
    return (
      <div className="w-full p-2 text-[0.85rem] font-mono leading-relaxed">
        {rows.map((tokens, i) => (
          <TokenRow key={i} tokens={tokens} interactive={false} onNavigate={selectNode} />
        ))}
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="w-full p-2 border border-gray-700 rounded-md text-[0.85rem] font-mono leading-relaxed bg-gray-950 cursor-text min-h-[200px] flex-1 overflow-auto focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick?.() }}
      aria-label="Diagram specification — click to edit"
    >
      {rows.map((tokens, i) => (
        <TokenRow key={i} tokens={tokens} interactive={true} onNavigate={selectNode} />
      ))}
    </div>
  )
}
