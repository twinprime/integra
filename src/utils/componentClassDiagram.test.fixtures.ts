import type { ComponentNode, SequenceDiagramNode, UseCaseNode, UseCaseDiagramNode } from "../store/types"

export const makeSeqDiagram = (content: string, ownerUuid = "root-uuid"): SequenceDiagramNode => ({
  uuid: "seq-uuid",
  id: "seq",
  name: "Seq",
  type: "sequence-diagram",
  content,
  description: "",
  ownerComponentUuid: ownerUuid,
  referencedNodeIds: [],
  referencedFunctionUuids: [],
})

export const makeUseCase = (...diagrams: SequenceDiagramNode[]): UseCaseNode => ({
  uuid: "uc-uuid",
  id: "uc",
  name: "Use Case",
  type: "use-case",
  sequenceDiagrams: diagrams,
})

export const makeUcd = (...useCases: UseCaseNode[]): UseCaseDiagramNode => ({
  uuid: "ucd-uuid",
  id: "ucd",
  name: "UCD",
  type: "use-case-diagram",
  content: "",
  description: "",
  ownerComponentUuid: "root-uuid",
  referencedNodeIds: [],
  useCases,
})

export const makeRoot = (extraSeqDiagrams: SequenceDiagramNode[] = []): ComponentNode => ({
  uuid: "root-uuid",
  id: "root",
  name: "Root",
  type: "component",
  actors: [{ uuid: "user-uuid", id: "user", name: "User", type: "actor", description: "" }],
  subComponents: [
    {
      uuid: "compa-uuid",
      id: "compA",
      name: "Component A",
      type: "component",
      subComponents: [],
      actors: [],
      useCaseDiagrams: [],
      interfaces: [
        {
          uuid: "ifoo-uuid",
          id: "IFoo",
          name: "IFoo",
          type: "rest",
          functions: [
            {
              uuid: "fn1-uuid",
              id: "doSomething",
              parameters: [{ name: "id", type: "string", required: true }],
            },
          ],
        },
        {
          uuid: "ibar-uuid",
          id: "IBar",
          name: "IBar",
          type: "rest",
          functions: [
            {
              uuid: "fn2-uuid",
              id: "getAll",
              parameters: [{ name: "page", type: "number", required: false }],
            },
          ],
        },
      ],
    },
    {
      uuid: "compb-uuid",
      id: "compB",
      name: "Component B",
      type: "component",
      subComponents: [],
      actors: [],
      useCaseDiagrams: [],
      interfaces: [],
    },
  ],
  useCaseDiagrams: extraSeqDiagrams.length
    ? [makeUcd(makeUseCase(...extraSeqDiagrams))]
    : [],
  interfaces: [],
})

export const getCompA = (root: ComponentNode) => root.subComponents[0]

export const makeRootWithGrandchild = (extraSeqDiagrams: SequenceDiagramNode[] = []): ComponentNode => {
  const base = makeRoot(extraSeqDiagrams)
  return {
    ...base,
    subComponents: [
      base.subComponents[0],
      {
        ...base.subComponents[1],
        subComponents: [
          {
            uuid: "compb1-uuid",
            id: "compB1",
            name: "Component B1",
            type: "component",
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
              {
                uuid: "ib1-uuid",
                id: "IB1",
                name: "IB1",
                type: "rest",
                functions: [
                  {
                    uuid: "fnb1-uuid",
                    id: "handle",
                    parameters: [{ name: "x", type: "string", required: true }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

export const makeRootWithCompBInterfaces = (extraSeqDiagrams: SequenceDiagramNode[] = []): ComponentNode => {
  const base = makeRoot(extraSeqDiagrams)
  return {
    ...base,
    subComponents: [
      base.subComponents[0],
      {
        ...base.subComponents[1],
        interfaces: [
          {
            uuid: "ibaz-uuid",
            id: "IBaz",
            name: "IBaz",
            type: "rest",
            functions: [
              {
                uuid: "fn3-uuid",
                id: "process",
                parameters: [{ name: "data", type: "string", required: true }],
              },
            ],
          },
        ],
      },
    ],
  }
}
