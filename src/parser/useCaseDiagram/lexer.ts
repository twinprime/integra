/**
 * lexer.ts — single-mode Chevrotain lexer for use case diagrams.
 * Simpler than the sequence diagram lexer (no label mode needed).
 */
import { Lexer } from "chevrotain"
import { sharedTokens } from "../tokens"

export const UcdLexer = new Lexer(sharedTokens)

export function tokenizeUseCaseDiagram(input: string) {
  return UcdLexer.tokenize(input)
}
