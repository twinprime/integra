/**
 * lexer.ts — multi-mode Chevrotain lexer for use case diagrams.
 *
 * Modes:
 *  - default_mode: structural tokens (declarations, link arrows)
 *  - label_mode: activated after `:` — captures rest-of-line label text
 *
 * label_mode pops back to default_mode on NEWLINE.
 *
 * Supported arrow types (DSL → Mermaid graph):
 *   ->>   →  -->    (backward compat default, arrowhead)
 *   -->   →  -->    (arrowhead)
 *   ---   →  ---    (open, no arrowhead)
 *   --o   →  --o    (circle)
 *   --x   →  --x    (cross)
 *   <-->  →  <-->   (bidirectional arrow)
 *   o--o  →  o--o   (bidirectional circle)
 *   x--x  →  x--x   (bidirectional cross)
 *   -.->  →  -.->   (dotted arrow)
 *   -.-   →  -.-    (dotted open)
 *   ==>   →  ==>    (thick arrow)
 *   ===   →  ===    (thick open)
 *   ~~~   →  ~~~    (invisible)
 */
import { createToken, Lexer } from "chevrotain"
import {
  sharedTokens,
  Arrow as SharedArrow,
  Colon as SharedColon,
  Newline,
  WhiteSpace,
  Identifier,
} from "../tokens"

// ─── Arrow token (default_mode only) ─────────────────────────────────────────
// Longer patterns must come first to prevent prefix matches.

export const UcdArrow = createToken({
  name: "UcdArrow",
  pattern: /<-->|o--o|x--x|-\.->|-\.-|===|==>|~~~|-->>|-->|---|--o|--x|->>|--\)|-->|->/,
})

// ─── Colon that pushes label_mode ─────────────────────────────────────────────

export const UcdColon = createToken({
  name: "UcdColon",
  pattern: /:/,
  push_mode: "label_mode",
})

// ─── Comment token (default_mode only) ───────────────────────────────────────

/**
 * Matches a standalone comment starting with `#` through end-of-line.
 * Must be placed before Identifier in the token list so it takes priority.
 */
export const UcdComment = createToken({
  name: "UcdComment",
  pattern: /#[^\r\n]*/,
})

// ─── label_mode tokens ────────────────────────────────────────────────────────

/** Catch-all: rest-of-line text for link labels */
export const UcdLabelText = createToken({
  name: "UcdLabelText",
  pattern: /[^\r\n]+/,
})

/** Newline that pops label_mode back to default_mode */
const LabelNewlineExit = createToken({
  name: "LabelNewlineExit",
  pattern: /\r?\n/,
  line_breaks: true,
  pop_mode: true,
  categories: [Newline],
})

// ─── Build default_mode token list ───────────────────────────────────────────
// Replace shared Arrow with UcdArrow and shared Colon with UcdColon.
// Insert UcdComment before Identifier so `#` is not misidentified.

const defaultModeTokensBase = sharedTokens
  .map((t) => (t === SharedArrow ? UcdArrow : t))
  .map((t) => (t === SharedColon ? UcdColon : t))

const identifierIdx = defaultModeTokensBase.indexOf(Identifier)
const defaultModeTokens = [
  ...defaultModeTokensBase.slice(0, identifierIdx),
  UcdComment,
  ...defaultModeTokensBase.slice(identifierIdx),
]

// ─── Lexer definition ─────────────────────────────────────────────────────────

const ucdLexerDefinition = {
  modes: {
    default_mode: defaultModeTokens,
    label_mode: [LabelNewlineExit, WhiteSpace, UcdLabelText],
  },
  defaultMode: "default_mode",
}

export const UcdLexer = new Lexer(ucdLexerDefinition)

/** All unique tokens across all modes — needed by CstParser */
export const allUcdTokens = [
  ...defaultModeTokens,
  LabelNewlineExit,
  UcdLabelText,
]

export function tokenizeUseCaseDiagram(input: string) {
  return UcdLexer.tokenize(input)
}
