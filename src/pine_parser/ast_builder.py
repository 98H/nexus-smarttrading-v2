"""
Pine Script AST Generator and Parser.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any, List, Optional

from src.pine_parser.ast_nodes import (
    ASTNode,
    BinaryOp,
    Block,
    Identifier,
    IfStatement,
    Literal,
    Program,
    UnaryOp,
    VarDeclaration,
)


class TokenType(Enum):
    TYPE = "TYPE"
    IDENTIFIER = "IDENTIFIER"
    ASSIGN = "ASSIGN"
    INT_LITERAL = "INT_LITERAL"
    FLOAT_LITERAL = "FLOAT_LITERAL"
    BOOL_LITERAL = "BOOL_LITERAL"
    STRING_LITERAL = "STRING_LITERAL"
    NEWLINE = "NEWLINE"
    INDENT = "INDENT"
    DEDENT = "DEDENT"
    VAR = "VAR"
    CONST = "CONST"
    PLUS = "PLUS"
    MINUS = "MINUS"
    STAR = "STAR"
    SLASH = "SLASH"
    IF = "IF"
    ELSE = "ELSE"
    GREATER = "GREATER"
    GREATER_EQUAL = "GREATER_EQUAL"
    LESS = "LESS"
    LESS_EQUAL = "LESS_EQUAL"
    EQUAL = "EQUAL"
    NOT_EQUAL = "NOT_EQUAL"
    AND = "AND"
    OR = "OR"
    NOT = "NOT"
    LPAREN = "LPAREN"
    RPAREN = "RPAREN"
    EOF = "EOF"


@dataclass
class Token:
    type: TokenType
    value: Any
    line: int = 1
    column: int = 1


class PineSyntaxError(Exception):
    """Raised when an unexpected or malformed token sequence is encountered."""

    def __init__(self, message: str, line: int, column: int) -> None:
        super().__init__(f"Syntax error at {line}:{column}: {message}")
        self.message = message
        self.line = line
        self.column = column


class ASTBuilder:
    """Recursive descent AST builder for Pine Script token streams."""

    def __init__(self, tokens: List[Token]) -> None:
        self.tokens = tokens
        self.pos = 0

    def current_token(self) -> Token:
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        if self.tokens:
            last = self.tokens[-1]
            return Token(type=TokenType.EOF, value="", line=last.line, column=last.column)
        return Token(type=TokenType.EOF, value="", line=1, column=1)

    def peek(self, offset: int = 1) -> Token:
        idx = self.pos + offset
        if idx < len(self.tokens):
            return self.tokens[idx]
        if self.tokens:
            last = self.tokens[-1]
            return Token(type=TokenType.EOF, value="", line=last.line, column=last.column)
        return Token(type=TokenType.EOF, value="", line=1, column=1)

    def advance(self) -> Token:
        tok = self.current_token()
        if self.pos < len(self.tokens):
            self.pos += 1
        return tok

    def match(self, *token_types: TokenType) -> bool:
        return self.current_token().type in token_types

    def consume(self, token_type: TokenType, error_message: str) -> Token:
        if self.match(token_type):
            return self.advance()
        tok = self.current_token()
        raise PineSyntaxError(error_message, line=tok.line, column=tok.column)

    def build(self) -> Program:
        statements: List[ASTNode] = []
        while not self.match(TokenType.EOF):
            while self.match(TokenType.NEWLINE):
                self.advance()
            if self.match(TokenType.EOF):
                break
            stmt = self.parse_statement()
            statements.append(stmt)
        return Program(statements=statements)

    def parse_statement(self) -> ASTNode:
        tok = self.current_token()
        if tok.type == TokenType.IF:
            return self.parse_if_statement()
        if tok.type in (TokenType.VAR, TokenType.CONST, TokenType.TYPE):
            return self.parse_var_declaration()
        if tok.type == TokenType.IDENTIFIER:
            if self.peek().type == TokenType.ASSIGN:
                return self.parse_var_declaration()
            raise PineSyntaxError(
                f"Unexpected token '{tok.value}'",
                line=tok.line,
                column=tok.column,
            )
        raise PineSyntaxError(
            f"Unexpected token '{tok.value}'",
            line=tok.line,
            column=tok.column,
        )

    def parse_var_declaration(self) -> VarDeclaration:
        start_tok = self.current_token()
        is_var = False
        is_const = False

        if self.match(TokenType.VAR):
            is_var = True
            self.advance()
        elif self.match(TokenType.CONST):
            is_const = True
            self.advance()

        var_type: Optional[str] = None
        if self.match(TokenType.TYPE):
            type_tok = self.advance()
            var_type = str(type_tok.value)

        ident_tok = self.consume(
            TokenType.IDENTIFIER, "Expected identifier in variable declaration"
        )
        self.consume(TokenType.ASSIGN, "Expected '=' in variable declaration")
        initializer = self.parse_expression()

        if not self.match(TokenType.NEWLINE, TokenType.EOF, TokenType.DEDENT):
            trailing_tok = self.current_token()
            raise PineSyntaxError(
                f"Unexpected token '{trailing_tok.value}'",
                line=trailing_tok.line,
                column=trailing_tok.column,
            )
        if self.match(TokenType.NEWLINE):
            self.advance()

        return VarDeclaration(
            name=str(ident_tok.value),
            var_type=var_type,
            initializer=initializer,
            is_var=is_var,
            is_const=is_const,
            line=start_tok.line,
            column=start_tok.column,
        )

    def parse_if_statement(self) -> IfStatement:
        if_tok = self.consume(TokenType.IF, "Expected 'if'")
        condition = self.parse_expression()
        self.consume(TokenType.NEWLINE, "Expected newline after if condition")
        then_block = self.parse_block()

        saved_pos = self.pos
        while self.match(TokenType.NEWLINE):
            self.advance()

        else_block: Optional[Block] = None
        if self.match(TokenType.ELSE):
            self.advance()
            self.consume(TokenType.NEWLINE, "Expected newline after else")
            else_block = self.parse_block()
        else:
            self.pos = saved_pos

        return IfStatement(
            condition=condition,
            then_block=then_block,
            else_block=else_block,
            line=if_tok.line,
            column=if_tok.column,
        )

    def parse_block(self) -> Block:
        indent_tok = self.consume(TokenType.INDENT, "Expected indented block")
        statements: List[ASTNode] = []
        while not self.match(TokenType.DEDENT, TokenType.EOF):
            while self.match(TokenType.NEWLINE):
                self.advance()
            if self.match(TokenType.DEDENT, TokenType.EOF):
                break
            stmt = self.parse_statement()
            statements.append(stmt)

        self.consume(TokenType.DEDENT, "Expected dedent")
        return Block(
            statements=statements,
            line=indent_tok.line,
            column=indent_tok.column,
        )

    # ------------------------------------------------------------------------
    # Expression Parsing (Precedence climbing)
    # ------------------------------------------------------------------------

    def parse_expression(self) -> ASTNode:
        return self.parse_logical_or()

    def parse_logical_or(self) -> ASTNode:
        left = self.parse_logical_and()
        while self.match(TokenType.OR):
            op_tok = self.advance()
            right = self.parse_logical_and()
            left = BinaryOp(
                left=left,
                op=str(op_tok.value),
                right=right,
                line=left.line,
                column=left.column,
            )
        return left

    def parse_logical_and(self) -> ASTNode:
        left = self.parse_equality()
        while self.match(TokenType.AND):
            op_tok = self.advance()
            right = self.parse_equality()
            left = BinaryOp(
                left=left,
                op=str(op_tok.value),
                right=right,
                line=left.line,
                column=left.column,
            )
        return left

    def parse_equality(self) -> ASTNode:
        left = self.parse_comparison()
        while self.match(TokenType.EQUAL, TokenType.NOT_EQUAL):
            op_tok = self.advance()
            right = self.parse_comparison()
            left = BinaryOp(
                left=left,
                op=str(op_tok.value),
                right=right,
                line=left.line,
                column=left.column,
            )
        return left

    def parse_comparison(self) -> ASTNode:
        left = self.parse_additive()
        while self.match(
            TokenType.LESS,
            TokenType.LESS_EQUAL,
            TokenType.GREATER,
            TokenType.GREATER_EQUAL,
        ):
            op_tok = self.advance()
            right = self.parse_additive()
            left = BinaryOp(
                left=left,
                op=str(op_tok.value),
                right=right,
                line=left.line,
                column=left.column,
            )
        return left

    def parse_additive(self) -> ASTNode:
        left = self.parse_multiplicative()
        while self.match(TokenType.PLUS, TokenType.MINUS):
            op_tok = self.advance()
            right = self.parse_multiplicative()
            left = BinaryOp(
                left=left,
                op=str(op_tok.value),
                right=right,
                line=left.line,
                column=left.column,
            )
        return left

    def parse_multiplicative(self) -> ASTNode:
        left = self.parse_unary()
        while self.match(TokenType.STAR, TokenType.SLASH):
            op_tok = self.advance()
            right = self.parse_unary()
            left = BinaryOp(
                left=left,
                op=str(op_tok.value),
                right=right,
                line=left.line,
                column=left.column,
            )
        return left

    def parse_unary(self) -> ASTNode:
        if self.match(TokenType.NOT, TokenType.MINUS, TokenType.PLUS):
            op_tok = self.advance()
            operand = self.parse_unary()
            return UnaryOp(
                op=str(op_tok.value),
                operand=operand,
                line=op_tok.line,
                column=op_tok.column,
            )
        return self.parse_primary()

    def parse_primary(self) -> ASTNode:
        tok = self.current_token()
        if self.match(TokenType.INT_LITERAL):
            self.advance()
            return Literal(
                value=tok.value,
                data_type="int",
                line=tok.line,
                column=tok.column,
            )
        if self.match(TokenType.FLOAT_LITERAL):
            self.advance()
            return Literal(
                value=tok.value,
                data_type="float",
                line=tok.line,
                column=tok.column,
            )
        if self.match(TokenType.BOOL_LITERAL):
            self.advance()
            return Literal(
                value=tok.value,
                data_type="bool",
                line=tok.line,
                column=tok.column,
            )
        if self.match(TokenType.STRING_LITERAL):
            self.advance()
            return Literal(
                value=tok.value,
                data_type="string",
                line=tok.line,
                column=tok.column,
            )
        if self.match(TokenType.IDENTIFIER):
            self.advance()
            return Identifier(
                name=str(tok.value),
                line=tok.line,
                column=tok.column,
            )
        if self.match(TokenType.LPAREN):
            self.advance()
            expr = self.parse_expression()
            self.consume(TokenType.RPAREN, "Expected ')' after expression")
            return expr

        raise PineSyntaxError(
            f"Expected expression, found '{tok.value}'",
            line=tok.line,
            column=tok.column,
        )