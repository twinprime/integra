/**
 * parser.ts — Chevrotain CstParser for sequence diagrams.
 *
 * Grammar (EBNF):
 *
 *   SequenceDiagram   ::= NEWLINE* (SeqStatement (NEWLINE+ | EOF))*
 *   SeqStatement      ::= SeqDeclaration | SeqNote | SeqMessage | SeqBlock
 *   SeqDeclaration    ::= (ACTOR | COMPONENT) NodePath (AS IDENTIFIER)?
 *   SeqNote           ::= NOTE SeqNotePosition COLON NOTE_TEXT
 *   SeqNotePosition   ::= (RIGHT | LEFT) OF IDENTIFIER
 *                       | OVER IDENTIFIER (COMMA IDENTIFIER)?
 *   SeqMessage        ::= IDENTIFIER ARROW IDENTIFIER (COLON (FUNCTION_REF | LABEL_TEXT))?
 *   SeqBlock          ::= (LOOP | ALT | PAR) BlockConditionText? NEWLINE
 *                         NEWLINE*
 *                         (SeqStatement (NEWLINE+ | ε))*
 *                         SeqBlockSection*
 *                         END
 *   SeqBlockSection   ::= (ELSE | AND) BlockConditionText? NEWLINE
 *                         NEWLINE*
 *                         (SeqStatement (NEWLINE+ | ε))*
 */
import { CstParser } from "chevrotain"
import {
  Actor, Component, As, Note, Right, Left, Of, Over,
  Slash, Comma, Newline, Identifier, NumberToken,
} from "../tokens"
import {
  FunctionRef, UseCaseRef, SequenceRef, LabelText, SeqLexer, SeqColon, allSeqTokens,
  SeqArrow, Loop, Alt, Par, Opt, Else, And, End, BlockConditionText,
} from "./lexer"

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
      { ALT: () => this.SUBRULE(this.seqBlock) },
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

  // ─── Participant reference (one or more space-separated words, digits allowed) ─

  participantRef = this.RULE("participantRef", () => {
    this.OR([
      { ALT: () => this.CONSUME(Identifier) },
      { ALT: () => this.CONSUME(NumberToken) },
    ])
    this.MANY(() => this.OR2([
      { ALT: () => this.CONSUME2(Identifier) },
      { ALT: () => this.CONSUME2(NumberToken) },
    ]))
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
    this.CONSUME(SeqArrow)
    this.SUBRULE2(this.participantRef)
    this.OPTION(() => {
      this.CONSUME(SeqColon)
      // After SeqColon the lexer switches to text_mode — FunctionRef, UseCaseRef, or LabelText
      this.OR([
        { ALT: () => this.CONSUME(FunctionRef) },
        { ALT: () => this.CONSUME(UseCaseRef) },
        { ALT: () => this.CONSUME(SequenceRef) },
        { ALT: () => this.CONSUME(LabelText) },
      ])
    })
  })

  // ─── Block constructs (loop / alt / par) ──────────────────────────────────

  seqBlock = this.RULE("seqBlock", () => {
    // Opening keyword — lexer pushes block_header_mode
    this.OR([
      { ALT: () => this.CONSUME(Loop) },
      { ALT: () => this.CONSUME(Alt) },
      { ALT: () => this.CONSUME(Par) },
      { ALT: () => this.CONSUME(Opt) },
    ])
    // Optional condition text + newline (both in block_header_mode)
    this.OPTION(() => this.CONSUME(BlockConditionText))
    this.CONSUME(Newline)       // BlockNewlineExit pops block_header_mode
    this.MANY(() => this.CONSUME2(Newline)) // skip blank lines before body

    // First section body
    this.MANY2(() => {
      this.SUBRULE(this.seqStatement)
      this.OR2([
        { ALT: () => this.AT_LEAST_ONE(() => this.CONSUME3(Newline)) },
        { ALT: () => {} }, // ε — statement immediately before else/and/end
      ])
    })

    // Additional sections (else for alt, and for par)
    this.MANY3(() => this.SUBRULE(this.seqBlockSection))

    this.CONSUME(End)
  })

  seqBlockSection = this.RULE("seqBlockSection", () => {
    // Section keyword — lexer pushes block_header_mode
    this.OR([
      { ALT: () => this.CONSUME(Else) },
      { ALT: () => this.CONSUME(And) },
    ])
    // Optional condition text + newline (in block_header_mode)
    this.OPTION(() => this.CONSUME(BlockConditionText))
    this.CONSUME(Newline)
    this.MANY(() => this.CONSUME2(Newline))

    // Section body
    this.MANY2(() => {
      this.SUBRULE(this.seqStatement)
      this.OR2([
        { ALT: () => this.AT_LEAST_ONE(() => this.CONSUME3(Newline)) },
        { ALT: () => {} },
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
  Arrow, Slash, Comma, Newline, Identifier, NumberToken,
} from "../tokens"
export { FunctionRef, UseCaseRef, LabelText, SeqColon, SeqArrow, Loop, Alt, Par, Opt, Else, And, End, BlockConditionText } from "./lexer"
