/**
 * lexer.ts — multi-mode Chevrotain lexer for sequence diagrams.
 *
 * Modes:
 *  - default_mode: structural tokens (declarations, message arrows)
 *  - text_mode: activated after `:` — captures FUNCTION_REF or LABEL_TEXT / NOTE_TEXT
 *
 * text_mode pops back to default_mode on NEWLINE.
 */
import { createToken, Lexer } from "chevrotain"
import { sharedTokens, Colon as SharedColon, Newline, WhiteSpace } from "../tokens"

// ─── Label / note text tokens (only in text_mode) ─────────────────────────────

/** Matches `InterfaceId:FunctionId(params)` — tried first in text_mode */
export const FunctionRef = createToken({
  name: "FunctionRef",
  pattern: /[A-Za-z_]\w*:[A-Za-z_]\w*\([^)]*\)/,
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

// ─── Lexer definition ─────────────────────────────────────────────────────────

// default_mode: sharedTokens with Colon replaced by SeqColon
const defaultModeTokens = sharedTokens.map((t) => (t === SharedColon ? SeqColon : t))

export const seqLexerDefinition = {
  modes: {
    default_mode: defaultModeTokens,
    text_mode: [NewlineExit, WhiteSpace, FunctionRef, LabelText],
  },
  defaultMode: "default_mode",
}

export const SeqLexer = new Lexer(seqLexerDefinition)

// All unique tokens (default + text mode, deduped) — needed by the CstParser
export const allSeqTokens = [
  ...defaultModeTokens,
  NewlineExit,
  FunctionRef,
  LabelText,
]

export { Newline }
