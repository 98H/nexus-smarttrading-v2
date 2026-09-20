"""
Abstract Syntax Tree (AST) node definitions for Pine Script parser.
"""

from typing import Any, List, Optional


class ASTNode:
    """Base class for all AST nodes."""

    def __init__(
        self,
        line: Optional[int] = None,
        column: Optional[int] = None,
    ) -> None:
        self.line = line
        self.column = column

    def __repr__(self) -> str:
        attrs = ", ".join(f"{k}={v!r}" for k, v in self.__dict__.items())
        return f"{self.__class__.__name__}({attrs})"

    def __eq__(self, other: object) -> bool:
        if type(other) is not type(self):
            return False
        return self.__dict__ == other.__dict__


class Program(ASTNode):
    """Root node of a Pine Script program."""

    def __init__(
        self,
        statements: Optional[List[ASTNode]] = None,
        line: Optional[int] = None,
        column: Optional[int] = None,
    ) -> None:
        super().__init__(line, column)
        self.statements: List[ASTNode] = statements if statements is not None else []


class Block(ASTNode):
    """A scoped sequence of statements within a block (e.g. if/else body)."""

    def __init__(
        self,
        statements: Optional[List[ASTNode]] = None,
        line: Optional[int] = None,
        column: Optional[int] = None,
    ) -> None:
        super().__init__(line, column)
        self.statements: List[ASTNode] = statements if statements is not None else []


class VarDeclaration(ASTNode):
    """Variable declaration node, supporting explicit/inferred types and modifiers."""

    def __init__(
        self,
        name: str,
        var_type: Optional[str] = None,
        initializer: Optional[ASTNode] = None,
        is_var: bool = False,
        is_const: bool = False,
        line: Optional[int] = None,
        column: Optional[int] = None,
    ) -> None:
        super().__init__(line, column)
        self.name = name
        self.var_type = var_type
        self.initializer = initializer
        self.is_var = is_var
        self.is_const = is_const


class IfStatement(ASTNode):
    """Control flow branching statement with condition, then block, and optional else block."""

    def __init__(
        self,
        condition: ASTNode,
        then_block: Block,
        else_block: Optional[Block] = None,
        line: Optional[int] = None,
        column: Optional[int] = None,
    ) -> None:
        super().__init__(line, column)
        self.condition = condition
        self.then_block = then_block
        self.else_block = else_block


class BinaryOp(ASTNode):
    """Binary operation node representing infix operations."""

    def __init__(
        self,
        left: ASTNode,
        op: str,
        right: ASTNode,
        line: Optional[int] = None,
        column: Optional[int] = None,
    ) -> None:
        super().__init__(line, column)
        self.left = left
        self.op = op
        self.right = right


class UnaryOp(ASTNode):
    """Unary operation node (e.g. -x, not flag)."""

    def __init__(
        self,
        op: str,
        operand: ASTNode,
        line: Optional[int] = None,
        column: Optional[int] = None,
    ) -> None:
        super().__init__(line, column)
        self.op = op
        self.operand = operand


class Literal(ASTNode):
    """Literal constant value node."""

    def __init__(
        self,
        value: Any,
        data_type: str,
        line: Optional[int] = None,
        column: Optional[int] = None,
    ) -> None:
        super().__init__(line, column)
        self.value = value
        self.data_type = data_type


class Identifier(ASTNode):
    """Variable or reference identifier node."""

    def __init__(
        self,
        name: str,
        line: Optional[int] = None,
        column: Optional[int] = None,
    ) -> None:
        super().__init__(line, column)
        self.name = name