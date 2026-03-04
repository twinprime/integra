/**
 * parser.ts — Chevrotain CstParser for sequence diagrams.
 *
 * Grammar (EBNF):
 *
 *   SequenceDiagram ::= NEWLINE* (SeqStatement (NEWLINE+ | EOF))*
 *   SeqStatement    ::= SeqDeclaration | SeqNote | SeqMessage
 *   SeqDeclaration  ::= (ACTOR | COMPONENT) NodePath (AS IDENTIFIER)?
 *   SeqNote         ::= NOTE SeqNotePosition COLON NOTE_TEXT
 *   SeqNotePosition ::= (RIGHT | LEFT) OF IDENTIFIER
 *                     | OVER IDENTIFIER (COMMA IDENTIFIER)?
 *   SeqMessage      ::= IDENTIFIER ARROW IDENTIFIER (COLON (FUNCTION_REF | LABEL_TEXT))?
 *   NodePath        ::= IDENTIFIER (SLASH IDENTIFIER)*
 */
import { CstParser } from "chevrotain"
import {
  Actor, Component, As, Note, Right, Left, Of, Over,
  Arrow, Slash, Comma, Newline, Identifier,
} from "../tokens"
import { FunctionRef, LabelText, SeqLexer, SeqColon, allSeqTokens } from "./lexer"

export class SequenceDiagramParser extends CstParser {
  constructor() {
    super(allSeqTokens, {
      recoveryEnabled: true,
    })
    this.performSelfAnalysis()
  }

  // ─── Top-level ──────────────────────────────────────────────────────────────

  sequenceDiagram = this.RULE("sequenceDiagram", () => {
    this.MANY(() => this.CONSUME(Newline))
    this.MANY2(() => {
      this.SUBRULE(this.seqStatement)
      this.OR([
        { ALT: () => this.AT_LEAST_ONE(() => this.CONSUME2(Newline)) },
        { ALT: () => {} }, // EOF
      ])
    })
  })

  seqStatement = this.RULE("seqStatement", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.seqDeclaration) },
      { ALT: () => this.SUBRULE(this.seqNote) },
      { ALT: () => this.SUBRULE(this.seqMessage) },
    ])
  })

  // ─── Declaration ────────────────────────────────────────────────────────────

  seqDeclaration = this.RULE("seqDeclaration", () => {
    this.OR([
      { ALT: () => this.CONSUME(Actor) },
      { ALT: () => this.CONSUME(Component) },
    ])
    this.SUBRULE(this.nodePath)
    this.OPTION(() => {
      this.CONSUME(As)
      this.CONSUME(Identifier)
    })
  })

  nodePath = this.RULE("nodePath", () => {
    this.CONSUME(Identifier)
    this.MANY(() => {
      this.CONSUME(Slash)
      this.CONSUME2(Identifier)
    })
  })

  // ─── Participant reference (one or more space-separated words) ───────────────

  participantRef = this.RULE("participantRef", () => {
    this.CONSUME(Identifier)
    this.MANY(() => this.CONSUME2(Identifier))
  })

  // ─── Note ───────────────────────────────────────────────────────────────────

  seqNote = this.RULE("seqNote", () => {
    this.CONSUME(Note)
    this.SUBRULE(this.seqNotePosition)
    this.CONSUME(SeqColon)
    // After SeqColon the lexer switches to text_mode — LabelText matches rest of line
    this.CONSUME(LabelText)
  })

  seqNotePosition = this.RULE("seqNotePosition", () => {
    this.OR([
      {
        ALT: () => {
          this.OR2([
            { ALT: () => this.CONSUME(Right) },
            { ALT: () => this.CONSUME(Left) },
          ])
          this.CONSUME(Of)
          this.SUBRULE(this.participantRef)
        },
      },
      {
        ALT: () => {
          this.CONSUME(Over)
          this.SUBRULE2(this.participantRef)
          this.OPTION(() => {
            this.CONSUME(Comma)
            this.SUBRULE3(this.participantRef)
          })
        },
      },
    ])
  })

  // ─── Message ─────────────────────────────────────────────────────────────────

  seqMessage = this.RULE("seqMessage", () => {
    this.SUBRULE(this.participantRef)
    this.CONSUME(Arrow)
    this.SUBRULE2(this.participantRef)
    this.OPTION(() => {
      this.CONSUME(SeqColon)
      // After SeqColon the lexer switches to text_mode — FunctionRef or LabelText
      this.OR([
        { ALT: () => this.CONSUME(FunctionRef) },
        { ALT: () => this.CONSUME(LabelText) },
      ])
    })
  })
}

// Singleton instance — Chevrotain parsers are expensive to construct
export const seqParser = new SequenceDiagramParser()

export function parseSequenceDiagramCst(input: string) {
  const lexResult = SeqLexer.tokenize(input)
  seqParser.input = lexResult.tokens
  const cst = seqParser.sequenceDiagram()
  return { cst, lexErrors: lexResult.errors, parseErrors: seqParser.errors }
}

// Re-export token types for use in visitor and tests
export {
  Actor, Component, As, Note, Right, Left, Of, Over,
  Arrow, Slash, Comma, Newline, Identifier,
} from "../tokens"
export { FunctionRef, LabelText, SeqColon } from "./lexer"
