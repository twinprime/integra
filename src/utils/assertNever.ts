/**
 * Exhaustiveness check helper. Call in the default branch of a switch/if over
 * a discriminated union to get a compile-time error when a new member is added.
 *
 * @example
 * switch (node.type) {
 *   case "component": return ...
 *   case "actor": return ...
 *   default: assertNever(node.type)
 * }
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${String(x)}`)
}
