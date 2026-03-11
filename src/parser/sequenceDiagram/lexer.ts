/**
 * lexer.ts — multi-mode Chevrotain lexer for sequence diagrams.
 *
 * Modes:
 *  - default_mode: structural tokens (declarations, message arrows, block keywords)
 *  - text_mode: activated after `:` — captures FUNCTION_REF or LABEL_TEXT / NOTE_TEXT
 *  - block_header_mode: activated after a block keyword (loop/alt/par/opt/else/and) —
 *    captures optional rest-of-line condition text, then pops back on newline
 *
 * text_mode and block_header_mode both pop back to default_mode on NEWLINE.
 */
import { createToken, Lexer } from "chevrotain"
import { sharedTokens, Colon as SharedColon, Arrow as SharedArrow, Newline, WhiteSpace, Identifier } from "../tokens"

// ─── Indent token (default_mode only) ────────────────────────────────────────

/**
 * Matches leading whitespace at the start of a line (right after a \n).
 * Returns null for blank lines (whitespace followed immediately by \n or \r\n)
 * so they continue to be silently skipped by the WhiteSpace token.
 * Must be placed before WhiteSpace in the token list so it gets priority.
 */
export const Indent = createToken({
  name: "Indent",
  pattern: (text, offset) => {
    if (offset === 0 || text[offset - 1] !== "\n") return null
    const match = /^[ \t]+/.exec(text.slice(offset))
    if (!match) return null
    const afterIndent = offset + match[0].length
    if (afterIndent >= text.length || text[afterIndent] === "\n" || text[afterIndent] === "\r") return null
    return match
  },
  line_breaks: false,
})

// ─── Comment token (default_mode only) ───────────────────────────────────────

/**
 * Matches a standalone comment starting with `#` through end-of-line.
 * Comments may only appear on their own line (possibly preceded by an Indent).
 * Must be placed before Identifier in the token list so it takes priority.
 */
export const Comment = createToken({
  name: "Comment",
  pattern: /#[^\r\n]*/,
})

// ─── Label / note text tokens (only in text_mode) ─────────────────────────────

/**
 * Matches `InterfaceId:FunctionId(params)` optionally followed by `:display label`
 * (e.g. `IAuth:login():my label`).  Tried first in text_mode.
 */
export const FunctionRef = createToken({
  name: "FunctionRef",
  pattern: /[A-Za-z_]\w*:[A-Za-z_]\w*\([^)]*\)(?::[^\r\n]*)?/,
})

/**
 * Matches `UseCase:<path>` or `UseCase:<path>:<label>` where <path> is one or
 * more slash-separated identifiers (e.g. `UseCase:rec_stream` or
 * `UseCase:root/recorder/rec_stream:my label`).
 * Tried before LabelText so it takes priority.
 */
export const UseCaseRef = createToken({
  name: "UseCaseRef",
  pattern: /UseCase:[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*(?::[^\r\n]*)?/,
})

/**
 * Matches `Sequence:<path>` or `Sequence:<path>:<label>` where <path> is one or
 * more slash-separated identifiers (e.g. `Sequence:loginFlow` or
 * `Sequence:auth/loginFlow:my label`).
 * Tried before LabelText so it takes priority.
 */
export const SequenceRef = createToken({
  name: "SequenceRef",
  pattern: /Sequence:[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*(?::[^\r\n]*)?/,
})

/** Catch-all: rest of line text for plain message labels and note bodies */
export const LabelText = createToken({
  name: "LabelText",
  pattern: /[^\r\n]+/,
})

// text_mode alias for note body (same pattern, separate token for visitor clarity)
export const NoteText = LabelText

// ─── Newline that pops text_mode back to default ──────────────────────────────

const NewlineExit = createToken({
  name: "NewlineExit",
  pattern: /\r?\n/,
  line_breaks: true,
  pop_mode: true,
  categories: [Newline], // treated as a Newline by the parser
})

// ─── Colon that pushes text_mode ─────────────────────────────────────────────

/**
 * SeqColon replaces the shared Colon in default_mode.
 * When encountered, the lexer pushes text_mode so the next token is either
 * FunctionRef or LabelText (rest-of-line).
 */
export const SeqColon = createToken({
  name: "SeqColon",
  pattern: /:/,
  push_mode: "text_mode",
})

// ─── Block keywords (sequence-diagram-specific) ───────────────────────────────

/**
 * Covers all 8 Mermaid sequence diagram arrow types. Longer patterns come
 * first to prevent prefix matches (e.g. -->> before -->).
 *
 * | Arrow | Mermaid meaning                        |
 * |-------|----------------------------------------|
 * | ->>   | Solid line, arrowhead (sync call)      |
 * | -->>  | Dotted line, arrowhead (reply/async)   |
 * | ->    | Solid line, no arrowhead               |
 * | -->   | Dotted line, no arrowhead              |
 * | -x    | Solid line, X (destroy)                |
 * | --x   | Dotted line, X                         |
 * | -)    | Solid line, open arrowhead (async)     |
 * | --)   | Dotted line, open arrowhead            |
 */
export const SeqArrow = createToken({
  name: "SeqArrow",
  pattern: /-->>|--x|--\)|-->|->>|-x|-\)|->/ ,
})

/**
 * Block keywords must be listed BEFORE Identifier so the lexer gives them
 * priority. loop/alt/par/opt/else/and push block_header_mode to capture
 * optional condition text. end stays in default_mode (no condition text).
 */
export const Loop = createToken({ name: "Loop", pattern: /loop(?![a-zA-Z0-9_])/, push_mode: "block_header_mode" })
export const Alt  = createToken({ name: "Alt",  pattern: /alt(?![a-zA-Z0-9_])/,  push_mode: "block_header_mode" })
export const Par  = createToken({ name: "Par",  pattern: /par(?![a-zA-Z0-9_])/,  push_mode: "block_header_mode" })
export const Opt  = createToken({ name: "Opt",  pattern: /opt(?![a-zA-Z0-9_])/,  push_mode: "block_header_mode" })
export const Else = createToken({ name: "Else", pattern: /else(?![a-zA-Z0-9_])/, push_mode: "block_header_mode" })
export const And  = createToken({ name: "And",  pattern: /and(?![a-zA-Z0-9_])/,  push_mode: "block_header_mode" })
export const End  = createToken({ name: "End",  pattern: /end(?![a-zA-Z0-9_])/ })

// ─── block_header_mode tokens ─────────────────────────────────────────────────

/** Optional rest-of-line condition/label text after a block keyword. */
export const BlockConditionText = createToken({
  name: "BlockConditionText",
  pattern: /[^\r\n]+/,
})

/** Newline that pops block_header_mode back to default_mode. */
const BlockNewlineExit = createToken({
  name: "BlockNewlineExit",
  pattern: /\r?\n/,
  line_breaks: true,
  pop_mode: true,
  categories: [Newline], // treated as Newline by the parser
})

// ─── Lexer definition ─────────────────────────────────────────────────────────

// Shared tokens with Colon replaced by SeqColon, and Arrow replaced by SeqArrow
const sharedWithSeqTokens = sharedTokens
  .map((t) => (t === SharedColon ? SeqColon : t))
  .map((t) => (t === SharedArrow ? SeqArrow : t))

// Insert block keywords before Identifier (so they have lexer priority).
// Indent must come first (before WhiteSpace) so it wins at line starts.
// Comment must come before Identifier so `#` is not misidentified.
const whitespaceIdx = sharedWithSeqTokens.indexOf(WhiteSpace)
const identifierIdx = sharedWithSeqTokens.indexOf(Identifier)
const defaultModeTokens = [
  Indent,                                                          // before WhiteSpace
  ...sharedWithSeqTokens.slice(0, whitespaceIdx),
  WhiteSpace,
  ...sharedWithSeqTokens.slice(whitespaceIdx + 1, identifierIdx),
  Loop, Alt, Par, Opt, Else, And, End,
  Comment,                                                         // before Identifier
  ...sharedWithSeqTokens.slice(identifierIdx),
]

export const seqLexerDefinition = {
  modes: {
    default_mode: defaultModeTokens,
    text_mode: [NewlineExit, WhiteSpace, FunctionRef, UseCaseRef, SequenceRef, LabelText],
    block_header_mode: [BlockNewlineExit, WhiteSpace, BlockConditionText],
  },
  defaultMode: "default_mode",
}

export const SeqLexer = new Lexer(seqLexerDefinition)

// All unique tokens (all modes, deduped) — needed by the CstParser
export const allSeqTokens = [
  ...defaultModeTokens,
  NewlineExit,
  FunctionRef,
  UseCaseRef,
  SequenceRef,
  LabelText,
  BlockNewlineExit,
  BlockConditionText,
]

export { Newline }
