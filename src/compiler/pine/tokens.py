"""Pine Script v5 token type definitions and Token representation."""

from dataclasses import dataclass
from enum import Enum
from typing import Any


class TokenType(Enum):
    # Keywords
    INDICATOR = "INDICATOR"
    STRATEGY = "STRATEGY"
    IF = "IF"
    ELSE = "ELSE"
    FOR = "FOR"
    TO = "TO"
    BY = "BY"
    WHILE = "WHILE"
    VAR = "VAR"
    VARIP = "VARIP"
    SWITCH = "SWITCH"
    BREAK = "BREAK"
    CONTINUE = "CONTINUE"
    RETURN = "RETURN"
    IMPORT = "IMPORT"
    EXPORT = "EXPORT"
    TYPE = "TYPE"

    # Literals
    IDENTIFIER = "IDENTIFIER"
    INT = "INT"
    FLOAT = "FLOAT"
    STRING = "STRING"
    BOOL = "BOOL"
    NA = "NA"

    # Operators
    ASSIGN = "ASSIGN"          # =
    REASSIGN = "REASSIGN"      # :=
    ARROW = "ARROW"            # =>
    EQ = "EQ"                  # ==
    NEQ = "NEQ"                # !=
    LE = "LE"                  # <=
    GE = "GE"                  # >=
    LT = "LT"                  # <
    GT = "GT"                  # >
    PLUS = "PLUS"              # +
    MINUS = "MINUS"            # -
    STAR = "STAR"              # *
    SLASH = "SLASH"            # /
    PERCENT = "PERCENT"        # %
    AND = "AND"
    OR = "OR"
    NOT = "NOT"

    # Delimiters
    LPAREN = "LPAREN"          # (
    RPAREN = "RPAREN"          # )
    LBRACKET = "LBRACKET"      # [
    RBRACKET = "RBRACKET"      # ]
    LBRACE = "LBRACE"          # {
    RBRACE = "RBRACE"          # }
    COMMA = "COMMA"            # ,
    COLON = "COLON"            # :
    SEMICOLON = "SEMICOLON"    # ;
    DOT = "DOT"                # .
    QUESTION = "QUESTION"      # ?

    # Special / Indentation
    COMPILER_DIRECTIVE = "COMPILER_DIRECTIVE"
    INDENT = "INDENT"
    DEDENT = "DEDENT"
    NEWLINE = "NEWLINE"
    EOF = "EOF"


@dataclass
class Token:
    """Represents a lexical token in Pine Script v5 source code."""

    type: TokenType
    value: Any
    line: int
    column: int