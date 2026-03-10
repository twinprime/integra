import type { InterfaceSpecification, InterfaceFunction } from "../../store/types"

/**
 * View-layer class that wraps a stored InterfaceSpecification whose parentInterfaceUuid is set.
 * The `functions` getter transparently returns the parent interface's functions so all
 * downstream React components (InterfaceEditor, FunctionEditor) work without modification.
 *
 * IMPORTANT: This class is only constructed at React render time and never stored in
 * Zustand or serialized to YAML. The underlying plain object (with functions: []) is what
 * gets stored. Spread/JSON.stringify on the plain object is safe.
 */
export class InheritedInterface implements InterfaceSpecification {
  readonly uuid: string
  readonly id: string
  readonly name: string
  readonly description: string | undefined
  readonly type: InterfaceSpecification["type"]
  readonly parentInterfaceUuid: string
  /** The resolved parent interface — used by get functions() */
  readonly parentIface: InterfaceSpecification

  constructor(data: InterfaceSpecification, parentIface: InterfaceSpecification) {
    this.uuid = data.uuid
    this.id = data.id
    this.name = data.name
    this.description = data.description
    this.type = data.type
    this.parentInterfaceUuid = data.parentInterfaceUuid!
    this.parentIface = parentIface
  }

  get functions(): InterfaceFunction[] {
    return this.parentIface.functions
  }

  // No-op setter so spread/Object.assign won't throw when assigning functions
  set functions(_: InterfaceFunction[]) {}
}
