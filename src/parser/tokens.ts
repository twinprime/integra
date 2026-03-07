/**
 * tokens.ts — shared Chevrotain token definitions used by both
 * the sequence diagram and use case diagram grammars.
 */
import { createToken, Lexer } from "chevrotain"

// ─── Keywords ─────────────────────────────────────────────────────────────────
// Keywords must be defined BEFORE IDENTIFIER so the lexer gives them priority.

export const Actor = createToken({ name: "Actor", pattern: /actor/, longer_alt: undefined })
export const Component = createToken({ name: "Component", pattern: /component/, longer_alt: undefined })
export const Use = createToken({ name: "Use", pattern: /use/, longer_alt: undefined })
export const Case = createToken({ name: "Case", pattern: /case/, longer_alt: undefined })
export const As = createToken({ name: "As", pattern: /as/, longer_alt: undefined })
export const Note = createToken({ name: "Note", pattern: /note/, longer_alt: undefined })
export const Right = createToken({ name: "Right", pattern: /right/, longer_alt: undefined })
export const Left = createToken({ name: "Left", pattern: /left/, longer_alt: undefined })
export const Of = createToken({ name: "Of", pattern: /of/, longer_alt: undefined })
export const Over = createToken({ name: "Over", pattern: /over/, longer_alt: undefined })

// ─── Structural tokens ────────────────────────────────────────────────────────

export const Arrow = createToken({ name: "Arrow", pattern: /->>/  })
export const Slash = createToken({ name: "Slash", pattern: /\// })
export const Colon = createToken({ name: "Colon", pattern: /:/ })
export const Comma = createToken({ name: "Comma", pattern: /,/ })

// ─── Identifier ───────────────────────────────────────────────────────────────
// IDENTIFIER must be listed AFTER all keywords. Chevrotain uses `longer_alt`
// to ensure keywords are matched preferentially over identifiers.

export const Identifier = createToken({ name: "Identifier", pattern: /[a-zA-Z_][a-zA-Z0-9_-]*/ })

// Numeric word token — allows digit-only words in participant references (e.g. "Output Topics 2")
export const NumberToken = createToken({ name: "NumberToken", pattern: /\d+/ })

// Wire longer_alt: keywords should fall back to Identifier if not matched
Actor.PATTERN = /actor(?![a-zA-Z0-9_-])/
Component.PATTERN = /component(?![a-zA-Z0-9_-])/
Use.PATTERN = /use(?![a-zA-Z0-9_-])/
Case.PATTERN = /case(?![a-zA-Z0-9_-])/
As.PATTERN = /as(?![a-zA-Z0-9_-])/
Note.PATTERN = /note(?![a-zA-Z0-9_-])/
Right.PATTERN = /right(?![a-zA-Z0-9_-])/
Left.PATTERN = /left(?![a-zA-Z0-9_-])/
Of.PATTERN = /of(?![a-zA-Z0-9_-])/
Over.PATTERN = /over(?![a-zA-Z0-9_-])/

// ─── Whitespace + newlines ────────────────────────────────────────────────────

export const Newline = createToken({
  name: "Newline",
  pattern: /\r?\n/,
  line_breaks: true,
})

export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /[ \t]+/,
  group: Lexer.SKIPPED,
})

// ─── Ordered token list for use in lexer definitions ─────────────────────────
// Order matters: keywords before Identifier, Arrow before Slash.

export const sharedTokens = [
  WhiteSpace,
  Newline,
  Arrow,      // ->> must come before Slash and Identifier
  Actor,
  Component,
  Use,
  Case,
  As,
  Note,
  Right,
  Left,
  Of,
  Over,
  Slash,
  Colon,
  Comma,
  Identifier,
  NumberToken,
]
