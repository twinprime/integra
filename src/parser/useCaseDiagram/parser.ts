/**
 * parser.ts — Chevrotain CstParser for use case diagrams.
 *
 * Grammar (EBNF):
 *
 *   UseCaseDiagram  ::= NEWLINE* (UcdStatement (NEWLINE+ | EOF))*
 *   UcdStatement    ::= UcdDeclaration | UcdLink | UcdComment
 *   UcdDeclaration  ::= UcdEntityType NodePath (AS IDENTIFIER)?
 *   UcdEntityType   ::= ACTOR | COMPONENT | (USE CASE)
 *   UcdLink         ::= IDENTIFIER UCDARROW IDENTIFIER (UCDCOLON UCDLABELTEXT)?
 *   NodePath        ::= IDENTIFIER (SLASH IDENTIFIER)*
 */
import { CstParser } from "chevrotain"
import {
  Actor, Component, Use, Case, As,
  Slash, Newline, Identifier,
} from "../tokens"
import { UcdLexer, UcdArrow, UcdColon, UcdLabelText, UcdComment, allUcdTokens } from "./lexer"

export class UseCaseDiagramParser extends CstParser {
  constructor() {
    super(allUcdTokens, { recoveryEnabled: true })
    this.performSelfAnalysis()
  }

  // ─── Top-level ──────────────────────────────────────────────────────────────

  useCaseDiagram = this.RULE("useCaseDiagram", () => {
    this.MANY(() => this.CONSUME(Newline))
    this.MANY2(() => {
      this.SUBRULE(this.ucdStatement)
      this.OR([
        { ALT: () => this.AT_LEAST_ONE(() => this.CONSUME2(Newline)) },
        { ALT: () => {} }, // EOF
      ])
    })
  })

  ucdStatement = this.RULE("ucdStatement", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.ucdDeclaration) },
      { ALT: () => this.SUBRULE(this.ucdLink) },
      { ALT: () => this.SUBRULE(this.ucdComment) },
    ])
  })

  ucdComment = this.RULE("ucdComment", () => {
    this.CONSUME(UcdComment)
  })

  // ─── Declaration ────────────────────────────────────────────────────────────

  ucdDeclaration = this.RULE("ucdDeclaration", () => {
    this.SUBRULE(this.ucdEntityType)
    this.SUBRULE(this.nodePath)
    this.OPTION(() => {
      this.CONSUME(As)
      this.CONSUME(Identifier)
    })
  })

  ucdEntityType = this.RULE("ucdEntityType", () => {
    this.OR([
      { ALT: () => this.CONSUME(Actor) },
      { ALT: () => this.CONSUME(Component) },
      {
        ALT: () => {
          this.CONSUME(Use)
          this.CONSUME(Case)
        },
      },
    ])
  })

  nodePath = this.RULE("nodePath", () => {
    this.CONSUME(Identifier)
    this.MANY(() => {
      this.CONSUME(Slash)
      this.CONSUME2(Identifier)
    })
  })

  // ─── Link ────────────────────────────────────────────────────────────────────

  ucdLink = this.RULE("ucdLink", () => {
    this.CONSUME(Identifier)
    this.CONSUME(UcdArrow)
    this.CONSUME2(Identifier)
    this.OPTION(() => {
      this.CONSUME(UcdColon)
      this.CONSUME(UcdLabelText)
    })
  })
}

// Singleton instance
export const ucdParser = new UseCaseDiagramParser()

export function parseUseCaseDiagramCst(input: string) {
  const lexResult = UcdLexer.tokenize(input)
  ucdParser.input = lexResult.tokens
  const cst = ucdParser.useCaseDiagram()
  return { cst, lexErrors: lexResult.errors, parseErrors: ucdParser.errors }
}
