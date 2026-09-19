"""Pine Script v5 lexical analyzer."""

from typing import Any
from src.compiler.pine.tokens import Token, TokenType


class LexerError(Exception):
    """Raised when tokenization fails due to syntax or character errors."""

    def __init__(self, message: str, line: int, column: int):
        super().__init__(f"{message} at line {line}, column {column}")
        self.message = message
        self.line = line
        self.column = column


class PineScriptLexer:
    """Lexical analyzer for Pine Script v5 source code."""

    KEYWORDS: dict[str, TokenType] = {
        "indicator": TokenType.INDICATOR,
        "strategy": TokenType.STRATEGY,
        "if": TokenType.IF,
        "else": TokenType.ELSE,
        "for": TokenType.FOR,
        "to": TokenType.TO,
        "by": TokenType.BY,
        "while": TokenType.WHILE,
        "var": TokenType.VAR,
        "varip": TokenType.VARIP,
        "switch": TokenType.SWITCH,
        "break": TokenType.BREAK,
        "continue": TokenType.CONTINUE,
        "return": TokenType.RETURN,
        "import": TokenType.IMPORT,
        "export": TokenType.EXPORT,
        "type": TokenType.TYPE,
        "and": TokenType.AND,
        "or": TokenType.OR,
        "not": TokenType.NOT,
    }

    MULTI_CHAR_OPS: list[tuple[str, TokenType]] = [
        (":=", TokenType.REASSIGN),
        ("=>", TokenType.ARROW),
        ("==", TokenType.EQ),
        ("!=", TokenType.NEQ),
        ("<=", TokenType.LE),
        (">=", TokenType.GE),
    ]

    SINGLE_CHAR_OPS: dict[str, TokenType] = {
        "=": TokenType.ASSIGN,
        "+": TokenType.PLUS,
        "-": TokenType.MINUS,
        "*": TokenType.STAR,
        "/": TokenType.SLASH,
        "%": TokenType.PERCENT,
        "<": TokenType.LT,
        ">": TokenType.GT,
        "(": TokenType.LPAREN,
        ")": TokenType.RPAREN,
        "[": TokenType.LBRACKET,
        "]": TokenType.RBRACKET,
        "{": TokenType.LBRACE,
        "}": TokenType.RBRACE,
        ",": TokenType.COMMA,
        ":": TokenType.COLON,
        ";": TokenType.SEMICOLON,
        "?": TokenType.QUESTION,
        ".": TokenType.DOT,
    }

    def tokenize(self, source: str) -> list[Token]:
        """Tokenize Pine Script v5 source code into a stream of Token objects."""
        if not source:
            return [Token(type=TokenType.EOF, value="", line=1, column=1)]

        raw_lines = source.splitlines(keepends=True)
        tokens: list[Token] = []
        indent_stack = [0]

        for line_num, line in enumerate(raw_lines, start=1):
            stripped_leading = line.lstrip(" \t")

            # Ignore blank lines and regular comments when tracking indentation
            if not stripped_leading or stripped_leading in ("\r", "\n", "\r\n"):
                continue
            if stripped_leading.startswith("//") and not stripped_leading.startswith("//@"):
                continue

            # Calculate line indentation level
            indent = 0
            idx = 0
            while idx < len(line) and line[idx] in (" ", "\t"):
                indent += 4 if line[idx] == "\t" else 1
                idx += 1

            # Manage indentation changes
            if indent > indent_stack[-1]:
                indent_stack.append(indent)
                tokens.append(Token(type=TokenType.INDENT, value="", line=line_num, column=1))
            elif indent < indent_stack[-1]:
                while indent < indent_stack[-1]:
                    indent_stack.pop()
                    tokens.append(Token(type=TokenType.DEDENT, value="", line=line_num, column=1))
                if indent != indent_stack[-1]:
                    raise LexerError("Inconsistent dedent level", line=line_num, column=indent + 1)

            # Tokenize characters on the current line
            col = idx + 1
            while idx < len(line):
                ch = line[idx]

                if ch in (" ", "\t"):
                    col += 4 if ch == "\t" else 1
                    idx += 1
                    continue

                if ch in ("\r", "\n"):
                    break

                # Comments and compiler directives
                if line[idx : idx + 2] == "//":
                    if line[idx : idx + 3] == "//@":
                        directive_value = line[idx:].rstrip("\r\n")
                        tokens.append(
                            Token(
                                type=TokenType.COMPILER_DIRECTIVE,
                                value=directive_value,
                                line=line_num,
                                column=col,
                            )
                        )
                    break

                # Numeric literals
                if ch.isdigit() or (
                    ch == "."
                    and idx + 1 < len(line)
                    and line[idx + 1].isdigit()
                ):
                    token, idx, col = self._lex_number(line, idx, col, line_num)
                    tokens.append(token)
                    continue

                # String literals
                if ch in ("'", '"'):
                    token, idx, col = self._lex_string(line, idx, col, line_num)
                    tokens.append(token)
                    continue

                # Identifiers, keywords, boolean and na literals
                if ch.isalpha() or ch == "_":
                    token, idx, col = self._lex_identifier(line, idx, col, line_num)
                    tokens.append(token)
                    continue

                # Multi-character operators
                matched_multi = False
                for op_text, op_type in self.MULTI_CHAR_OPS:
                    op_len = len(op_text)
                    if line[idx : idx + op_len] == op_text:
                        tokens.append(
                            Token(type=op_type, value=op_text, line=line_num, column=col)
                        )
                        idx += op_len
                        col += op_len
                        matched_multi = True
                        break
                if matched_multi:
                    continue

                # Single-character operators and delimiters
                if ch in self.SINGLE_CHAR_OPS:
                    tokens.append(
                        Token(
                            type=self.SINGLE_CHAR_OPS[ch],
                            value=ch,
                            line=line_num,
                            column=col,
                        )
                    )
                    idx += 1
                    col += 1
                    continue

                raise LexerError(f"Unexpected character {ch!r}", line=line_num, column=col)

        # End of file coordinate determination
        if raw_lines[-1].endswith(("\r", "\n")):
            eof_line = len(raw_lines) + 1
            eof_col = 1
        else:
            eof_line = len(raw_lines)
            eof_col = len(raw_lines[-1]) + 1

        # Emit any remaining dedents at EOF
        while len(indent_stack) > 1:
            indent_stack.pop()
            tokens.append(Token(type=TokenType.DEDENT, value="", line=eof_line, column=1))

        tokens.append(Token(type=TokenType.EOF, value="", line=eof_line, column=eof_col))
        return tokens

    def _lex_number(
        self, line: str, idx: int, col: int, line_num: int
    ) -> tuple[Token, int, int]:
        start_col = col
        start_idx = idx
        is_float = False

        if line[idx] == ".":
            is_float = True
            idx += 1
            col += 1

        while idx < len(line) and line[idx].isdigit():
            idx += 1
            col += 1

        if not is_float and idx < len(line) and line[idx] == ".":
            if idx + 1 < len(line) and line[idx + 1].isdigit():
                is_float = True
                idx += 1
                col += 1
                while idx < len(line) and line[idx].isdigit():
                    idx += 1
                    col += 1

        if idx < len(line) and line[idx] in ("e", "E"):
            exp_idx = idx + 1
            if exp_idx < len(line) and line[exp_idx] in ("+", "-"):
                exp_idx += 1
            if exp_idx < len(line) and line[exp_idx].isdigit():
                is_float = True
                col += (exp_idx + 1) - idx
                idx = exp_idx + 1
                while idx < len(line) and line[idx].isdigit():
                    idx += 1
                    col += 1

        raw_num = line[start_idx:idx]
        token_type = TokenType.FLOAT if is_float else TokenType.INT
        token_val: Any = float(raw_num) if is_float else int(raw_num)

        return Token(type=token_type, value=token_val, line=line_num, column=start_col), idx, col

    def _lex_string(
        self, line: str, idx: int, col: int, line_num: int
    ) -> tuple[Token, int, int]:
        quote_char = line[idx]
        start_col = col
        idx += 1
        col += 1
        val_chars: list[str] = []
        closed = False

        escape_map = {
            "n": "\n",
            "t": "\t",
            "r": "\r",
            "\\": "\\",
            "'": "'",
            '"': '"',
        }

        while idx < len(line):
            curr = line[idx]
            if curr in ("\r", "\n"):
                break
            if curr == "\\":
                if idx + 1 >= len(line) or line[idx + 1] in ("\r", "\n"):
                    break
                next_c = line[idx + 1]
                val_chars.append(escape_map.get(next_c, next_c))
                idx += 2
                col += 2
            elif curr == quote_char:
                idx += 1
                col += 1
                closed = True
                break
            else:
                val_chars.append(curr)
                idx += 1
                col += 1

        if not closed:
            raise LexerError(
                f"Unclosed string literal starting with {quote_char}",
                line=line_num,
                column=start_col,
            )

        return (
            Token(
                type=TokenType.STRING,
                value="".join(val_chars),
                line=line_num,
                column=start_col,
            ),
            idx,
            col,
        )

    def _lex_identifier(
        self, line: str, idx: int, col: int, line_num: int
    ) -> tuple[Token, int, int]:
        start_col = col
        start_idx = idx

        while idx < len(line) and (line[idx].isalnum() or line[idx] == "_"):
            idx += 1
            col += 1

        ident_text = line[start_idx:idx]

        if ident_text == "true":
            token = Token(type=TokenType.BOOL, value=True, line=line_num, column=start_col)
        elif ident_text == "false":
            token = Token(type=TokenType.BOOL, value=False, line=line_num, column=start_col)
        elif ident_text == "na":
            token = Token(type=TokenType.NA, value="na", line=line_num, column=start_col)
        elif ident_text in self.KEYWORDS:
            token = Token(
                type=self.KEYWORDS[ident_text],
                value=ident_text,
                line=line_num,
                column=start_col,
            )
        else:
            token = Token(
                type=TokenType.IDENTIFIER,
                value=ident_text,
                line=line_num,
                column=start_col,
            )

        return token, idx, col