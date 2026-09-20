"""
Unit tests for Pine Script AST Generator.
Covers Story 4.1.2:
- Acceptance Criteria 1: Valid Pine Script token stream with variable declarations parses to typed declaration nodes.
- Acceptance Criteria 2: Control structures (if/else) parse to control flow nodes with conditions and body blocks.
- Acceptance Criteria 3: Unexpected/malformed token sequences raise PineSyntaxError with line and column metadata.
"""

from typing import Any, List
import pytest

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
from src.pine_parser.ast_builder import (
    ASTBuilder,
    PineSyntaxError,
    Token,
    TokenType,
)


@pytest.fixture
def token_factory():
    """Factory helper to quickly construct Token instances."""

    def _create(
        token_type: TokenType,
        value: Any,
        line: int = 1,
        column: int = 1,
    ) -> Token:
        return Token(type=token_type, value=value, line=line, column=column)

    return _create


def eof_token(line: int = 1, column: int = 1) -> Token:
    """Helper to generate an EOF token at specified coordinates."""
    return Token(type=TokenType.EOF, value="", line=line, column=column)


# ============================================================================
# AST Node Unit Tests
# ============================================================================


class TestASTNodeDefinitions:
    """Validates structural properties, base classes, and invariants of AST nodes."""

    def test_node_inheritance(self):
        """All specialized nodes must inherit from the base ASTNode."""
        nodes = [
            Program(statements=[]),
            VarDeclaration(name="x", var_type="int", initializer=None),
            IfStatement(
                condition=Identifier(name="cond"),
                then_block=Block(statements=[]),
            ),
            Block(statements=[]),
            BinaryOp(
                left=Literal(value=1, data_type="int"),
                op="+",
                right=Literal(value=2, data_type="int"),
            ),
            UnaryOp(op="-", operand=Literal(value=5, data_type="int")),
            Literal(value=10, data_type="int"),
            Identifier(name="foo"),
        ]
        for node in nodes:
            assert isinstance(node, ASTNode)

    def test_literal_node_attributes(self):
        lit = Literal(value=3.14, data_type="float", line=2, column=5)
        assert lit.value == 3.14
        assert lit.data_type == "float"
        assert lit.line == 2
        assert lit.column == 5

    def test_var_declaration_default_modifiers(self):
        decl = VarDeclaration(name="val", var_type="float", initializer=None)
        assert decl.is_var is False
        assert decl.is_const is False

    def test_if_statement_defaults(self):
        cond = Identifier(name="flag")
        body = Block(statements=[])
        stmt = IfStatement(condition=cond, then_block=body)
        assert stmt.condition == cond
        assert stmt.then_block == body
        assert stmt.else_block is None


# ============================================================================
# Acceptance Criteria 1: Variable Declarations
# ============================================================================


class TestVariableDeclarationParsing:
    """
    Given a valid Pine Script token stream with variable declarations,
    When passed to the AST builder,
    Then an AST containing typed declaration nodes with assigned expressions is returned.
    """

    def test_explicit_primitive_int_declaration(self, token_factory):
        # int x = 42
        tokens = [
            token_factory(TokenType.TYPE, "int", 1, 1),
            token_factory(TokenType.IDENTIFIER, "x", 1, 5),
            token_factory(TokenType.ASSIGN, "=", 1, 7),
            token_factory(TokenType.INT_LITERAL, 42, 1, 9),
            eof_token(1, 11),
        ]

        builder = ASTBuilder(tokens)
        ast = builder.build()

        assert isinstance(ast, Program)
        assert len(ast.statements) == 1
        decl = ast.statements[0]
        assert isinstance(decl, VarDeclaration)
        assert decl.name == "x"
        assert decl.var_type == "int"
        assert decl.line == 1
        assert decl.column == 1
        assert isinstance(decl.initializer, Literal)
        assert decl.initializer.value == 42
        assert decl.initializer.data_type == "int"

    def test_explicit_primitive_float_declaration(self, token_factory):
        # float price = 105.75
        tokens = [
            token_factory(TokenType.TYPE, "float", 2, 1),
            token_factory(TokenType.IDENTIFIER, "price", 2, 7),
            token_factory(TokenType.ASSIGN, "=", 2, 13),
            token_factory(TokenType.FLOAT_LITERAL, 105.75, 2, 15),
            eof_token(2, 21),
        ]

        builder = ASTBuilder(tokens)
        ast = builder.build()

        assert len(ast.statements) == 1
        decl = ast.statements[0]
        assert isinstance(decl, VarDeclaration)
        assert decl.name == "price"
        assert decl.var_type == "float"
        assert isinstance(decl.initializer, Literal)
        assert decl.initializer.value == 105.75
        assert decl.initializer.data_type == "float"

    def test_bool_and_string_declarations(self, token_factory):
        # bool is_ready = true
        # string label = "entry"
        tokens = [
            token_factory(TokenType.TYPE, "bool", 1, 1),
            token_factory(TokenType.IDENTIFIER, "is_ready", 1, 6),
            token_factory(TokenType.ASSIGN, "=", 1, 15),
            token_factory(TokenType.BOOL_LITERAL, True, 1, 17),
            token_factory(TokenType.NEWLINE, "\n", 1, 21),
            token_factory(TokenType.TYPE, "string", 2, 1),
            token_factory(TokenType.IDENTIFIER, "label", 2, 8),
            token_factory(TokenType.ASSIGN, "=", 2, 14),
            token_factory(TokenType.STRING_LITERAL, "entry", 2, 16),
            eof_token(2, 23),
        ]

        builder = ASTBuilder(tokens)
        ast = builder.build()

        assert len(ast.statements) == 2
        decl1, decl2 = ast.statements
        assert isinstance(decl1, VarDeclaration)
        assert decl1.name == "is_ready"
        assert decl1.var_type == "bool"
        assert decl1.initializer.value is True
        assert decl1.initializer.data_type == "bool"

        assert isinstance(decl2, VarDeclaration)
        assert decl2.name == "label"
        assert decl2.var_type == "string"
        assert decl2.initializer.value == "entry"
        assert decl2.initializer.data_type == "string"

    def test_persistent_var_declaration(self, token_factory):
        # var int bar_count = 0
        tokens = [
            token_factory(TokenType.VAR, "var", 1, 1),
            token_factory(TokenType.TYPE, "int", 1, 5),
            token_factory(TokenType.IDENTIFIER, "bar_count", 1, 9),
            token_factory(TokenType.ASSIGN, "=", 1, 19),
            token_factory(TokenType.INT_LITERAL, 0, 1, 21),
            eof_token(1, 22),
        ]

        builder = ASTBuilder(tokens)
        ast = builder.build()

        assert len(ast.statements) == 1
        decl = ast.statements[0]
        assert isinstance(decl, VarDeclaration)
        assert decl.is_var is True
        assert decl.is_const is False
        assert decl.name == "bar_count"
        assert decl.var_type == "int"
        assert decl.initializer.value == 0

    def test_const_modifier_declaration(self, token_factory):
        # const float PI = 3.14159
        tokens = [
            token_factory(TokenType.CONST, "const", 1, 1),
            token_factory(TokenType.TYPE, "float", 1, 7),
            token_factory(TokenType.IDENTIFIER, "PI", 1, 13),
            token_factory(TokenType.ASSIGN, "=", 1, 16),
            token_factory(TokenType.FLOAT_LITERAL, 3.14159, 1, 18),
            eof_token(1, 25),
        ]

        builder = ASTBuilder(tokens)
        ast = builder.build()

        decl = ast.statements[0]
        assert isinstance(decl, VarDeclaration)
        assert decl.is_const is True
        assert decl.is_var is False
        assert decl.name == "PI"
        assert decl.var_type == "float"

    def test_declaration_with_binary_expression_assignment(self, token_factory):
        # int offset = base + 5
        tokens = [
            token_factory(TokenType.TYPE, "int", 1, 1),
            token_factory(TokenType.IDENTIFIER, "offset", 1, 5),
            token_factory(TokenType.ASSIGN, "=", 1, 12),
            token_factory(TokenType.IDENTIFIER, "base", 1, 14),
            token_factory(TokenType.PLUS, "+", 1, 19),
            token_factory(TokenType.INT_LITERAL, 5, 1, 21),
            eof_token(1, 22),
        ]

        builder = ASTBuilder(tokens)
        ast = builder.build()

        decl = ast.statements[0]
        assert isinstance(decl, VarDeclaration)
        assert isinstance(decl.initializer, BinaryOp)
        assert decl.initializer.op == "+"
        assert isinstance(decl.initializer.left, Identifier)
        assert decl.initializer.left.name == "base"
        assert isinstance(decl.initializer.right, Literal)
        assert decl.initializer.right.value == 5

    def test_untyped_declaration_inferred(self, token_factory):
        # my_val = 100
        tokens = [
            token_factory(TokenType.IDENTIFIER, "my_val", 1, 1),
            token_factory(TokenType.ASSIGN, "=", 1, 8),
            token_factory(TokenType.INT_LITERAL, 100, 1, 10),
            eof_token(1, 13),
        ]

        builder = ASTBuilder(tokens)
        ast = builder.build()

        decl = ast.statements[0]
        assert isinstance(decl, VarDeclaration)
        assert decl.name == "my_val"
        assert decl.var_type is None
        assert decl.initializer.value == 100


# ============================================================================
# Acceptance Criteria 2: Control Structures (if/else)
# ============================================================================


class TestControlStructureParsing:
    """
    Given a Pine Script token stream containing control structures (`if`/`else`),
    When parsed by the AST builder,
    Then an AST node representing the control flow with condition and body blocks is generated.
    """

    def test_simple_if_without_else(self, token_factory):
        # if close > open
        #     x = 1
        tokens = [
            token_factory(TokenType.IF, "if", 1, 1),
            token_factory(TokenType.IDENTIFIER, "close", 1, 4),
            token_factory(TokenType.GREATER, ">", 1, 10),
            token_factory(TokenType.IDENTIFIER, "open", 1, 12),
            token_factory(TokenType.NEWLINE, "\n", 1, 16),
            token_factory(TokenType.INDENT, "", 2, 1),
            token_factory(TokenType.IDENTIFIER, "x", 2, 5),
            token_factory(TokenType.ASSIGN, "=", 2, 7),
            token_factory(TokenType.INT_LITERAL, 1, 2, 9),
            token_factory(TokenType.NEWLINE, "\n", 2, 10),
            token_factory(TokenType.DEDENT, "", 3, 1),
            eof_token(3, 1),
        ]

        builder = ASTBuilder(tokens)
        ast = builder.build()

        assert len(ast.statements) == 1
        if_node = ast.statements[0]
        assert isinstance(if_node, IfStatement)
        assert if_node.line == 1
        assert if_node.column == 1

        # Check condition
        assert isinstance(if_node.condition, BinaryOp)
        assert if_node.condition.op == ">"
        assert isinstance(if_node.condition.left, Identifier)
        assert if_node.condition.left.name == "close"
        assert isinstance(if_node.condition.right, Identifier)
        assert if_node.condition.right.name == "open"

        # Check body block
        assert isinstance(if_node.then_block, Block)
        assert len(if_node.then_block.statements) == 1
        body_decl = if_node.then_block.statements[0]
        assert isinstance(body_decl, VarDeclaration)
        assert body_decl.name == "x"
        assert body_decl.initializer.value == 1

        # Check absence of else
        assert if_node.else_block is None

    def test_if_with_else_branch(self, token_factory):
        # if cond
        #     a = 1
        # else
        #     a = 2
        tokens = [
            token_factory(TokenType.IF, "if", 1, 1),
            token_factory(TokenType.IDENTIFIER, "cond", 1, 4),
            token_factory(TokenType.NEWLINE, "\n", 1, 8),
            token_factory(TokenType.INDENT, "", 2, 1),
            token_factory(TokenType.IDENTIFIER, "a", 2, 5),
            token_factory(TokenType.ASSIGN, "=", 2, 7),
            token_factory(TokenType.INT_LITERAL, 1, 2, 9),
            token_factory(TokenType.NEWLINE, "\n", 2, 10),
            token_factory(TokenType.DEDENT, "", 3, 1),
            token_factory(TokenType.ELSE, "else", 3, 1),
            token_factory(TokenType.NEWLINE, "\n", 3, 5),
            token_factory(TokenType.INDENT, "", 4, 1),
            token_factory(TokenType.IDENTIFIER, "a", 4, 5),
            token_factory(TokenType.ASSIGN, "=", 4, 7),
            token_factory(TokenType.INT_LITERAL, 2, 4, 9),
            token_factory(TokenType.NEWLINE, "\n", 4, 10),
            token_factory(TokenType.DEDENT, "", 5, 1),
            eof_token(5, 1),
        ]

        builder = ASTBuilder(tokens)
        ast = builder.build()

        assert len(ast.statements) == 1
        if_node = ast.statements[0]
        assert isinstance(if_node, IfStatement)
        assert isinstance(if_node.then_block, Block)
        assert isinstance(if_node.else_block, Block)

        # Check then_block
        assert len(if_node.then_block.statements) == 1
        assert if_node.then_block.statements[0].initializer.value == 1

        # Check else_block
        assert len(if_node.else_block.statements) == 1
        assert if_node.else_block.statements[0].initializer.value == 2

    def test_nested_if_structures(self, token_factory):
        # if cond1
        #     if cond2
        #         inner = 42
        tokens = [
            token_factory(TokenType.IF, "if", 1, 1),
            token_factory(TokenType.IDENTIFIER, "cond1", 1, 4),
            token_factory(TokenType.NEWLINE, "\n", 1, 9),
            token_factory(TokenType.INDENT, "", 2, 1),
            token_factory(TokenType.IF, "if", 2, 5),
            token_factory(TokenType.IDENTIFIER, "cond2", 2, 8),
            token_factory(TokenType.NEWLINE, "\n", 2, 13),
            token_factory(TokenType.INDENT, "", 3, 1),
            token_factory(TokenType.IDENTIFIER, "inner", 3, 9),
            token_factory(TokenType.ASSIGN, "=", 3, 15),
            token_factory(TokenType.INT_LITERAL, 42, 3, 17),
            token_factory(TokenType.NEWLINE, "\n", 3, 19),
            token_factory(TokenType.DEDENT, "", 4, 1),
            token_factory(TokenType.DEDENT, "", 4, 1),
            eof_token(4, 1),
        ]

        builder = ASTBuilder(tokens)
        ast = builder.build()

        outer_if = ast.statements[0]
        assert isinstance(outer_if, IfStatement)
        assert len(outer_if.then_block.statements) == 1

        inner_if = outer_if.then_block.statements[0]
        assert isinstance(inner_if, IfStatement)
        assert inner_if.condition.name == "cond2"
        assert len(inner_if.then_block.statements) == 1
        assert inner_if.then_block.statements[0].name == "inner"

    def test_if_with_logical_expression_condition(self, token_factory):
        # if a > 0 and b < 10
        #     x = true
        tokens = [
            token_factory(TokenType.IF, "if", 1, 1),
            token_factory(TokenType.IDENTIFIER, "a", 1, 4),
            token_factory(TokenType.GREATER, ">", 1, 6),
            token_factory(TokenType.INT_LITERAL, 0, 1, 8),
            token_factory(TokenType.AND, "and", 1, 10),
            token_factory(TokenType.IDENTIFIER, "b", 1, 14),
            token_factory(TokenType.LESS, "<", 1, 16),
            token_factory(TokenType.INT_LITERAL, 10, 1, 18),
            token_factory(TokenType.NEWLINE, "\n", 1, 20),
            token_factory(TokenType.INDENT, "", 2, 1),
            token_factory(TokenType.IDENTIFIER, "x", 2, 5),
            token_factory(TokenType.ASSIGN, "=", 2, 7),
            token_factory(TokenType.BOOL_LITERAL, True, 2, 9),
            token_factory(TokenType.NEWLINE, "\n", 2, 13),
            token_factory(TokenType.DEDENT, "", 3, 1),
            eof_token(3, 1),
        ]

        builder = ASTBuilder(tokens)
        ast = builder.build()

        if_stmt = ast.statements[0]
        assert isinstance(if_stmt.condition, BinaryOp)
        assert if_stmt.condition.op == "and"
        assert isinstance(if_stmt.condition.left, BinaryOp)
        assert if_stmt.condition.left.op == ">"
        assert isinstance(if_stmt.condition.right, BinaryOp)
        assert if_stmt.condition.right.op == "<"


# ============================================================================
# Acceptance Criteria 3: Malformed Sequences & Syntax Errors
# ============================================================================


class TestSyntaxErrorHandling:
    """
    Given an unexpected or malformed token sequence,
    When parsed by the AST builder,
    Then a PineSyntaxError with line and column metadata is raised.
    """

    def test_missing_identifier_in_typed_declaration(self, token_factory):
        # int = 42  (missing identifier at column 5)
        tokens = [
            token_factory(TokenType.TYPE, "int", 3, 1),
            token_factory(TokenType.ASSIGN, "=", 3, 5),
            token_factory(TokenType.INT_LITERAL, 42, 3, 7),
            eof_token(3, 9),
        ]

        builder = ASTBuilder(tokens)
        with pytest.raises(PineSyntaxError) as exc_info:
            builder.build()

        err = exc_info.value
        assert hasattr(err, "line")
        assert hasattr(err, "column")
        assert err.line == 3
        assert err.column == 5

    def test_unexpected_leading_operator(self, token_factory):
        # + 10
        tokens = [
            token_factory(TokenType.PLUS, "+", 4, 2),
            token_factory(TokenType.INT_LITERAL, 10, 4, 4),
            eof_token(4, 6),
        ]

        builder = ASTBuilder(tokens)
        with pytest.raises(PineSyntaxError) as exc_info:
            builder.build()

        err = exc_info.value
        assert err.line == 4
        assert err.column == 2

    def test_incomplete_assignment_before_eof(self, token_factory):
        # float rate = <EOF>
        tokens = [
            token_factory(TokenType.TYPE, "float", 5, 1),
            token_factory(TokenType.IDENTIFIER, "rate", 5, 7),
            token_factory(TokenType.ASSIGN, "=", 5, 12),
            eof_token(5, 14),
        ]

        builder = ASTBuilder(tokens)
        with pytest.raises(PineSyntaxError) as exc_info:
            builder.build()

        err = exc_info.value
        assert err.line == 5
        assert err.column == 14

    def test_malformed_if_condition_missing_expr(self, token_factory):
        # if \n    x = 1
        tokens = [
            token_factory(TokenType.IF, "if", 6, 1),
            token_factory(TokenType.NEWLINE, "\n", 6, 3),
            token_factory(TokenType.INDENT, "", 7, 1),
            token_factory(TokenType.IDENTIFIER, "x", 7, 5),
            token_factory(TokenType.ASSIGN, "=", 7, 7),
            token_factory(TokenType.INT_LITERAL, 1, 7, 9),
            eof_token(7, 10),
        ]

        builder = ASTBuilder(tokens)
        with pytest.raises(PineSyntaxError) as exc_info:
            builder.build()

        err = exc_info.value
        assert err.line == 6
        assert err.column == 3

    def test_missing_indented_body_after_if(self, token_factory):
        # if cond
        # y = 1 (no INDENT token)
        tokens = [
            token_factory(TokenType.IF, "if", 8, 1),
            token_factory(TokenType.IDENTIFIER, "cond", 8, 4),
            token_factory(TokenType.NEWLINE, "\n", 8, 8),
            token_factory(TokenType.IDENTIFIER, "y", 9, 1),
            token_factory(TokenType.ASSIGN, "=", 9, 3),
            token_factory(TokenType.INT_LITERAL, 1, 9, 5),
            eof_token(9, 6),
        ]

        builder = ASTBuilder(tokens)
        with pytest.raises(PineSyntaxError) as exc_info:
            builder.build()

        err = exc_info.value
        assert err.line == 9
        assert err.column == 1

    def test_unmatched_closing_parenthesis(self, token_factory):
        # x = (1 + 2))
        tokens = [
            token_factory(TokenType.IDENTIFIER, "x", 10, 1),
            token_factory(TokenType.ASSIGN, "=", 10, 3),
            token_factory(TokenType.LPAREN, "(", 10, 5),
            token_factory(TokenType.INT_LITERAL, 1, 10, 6),
            token_factory(TokenType.PLUS, "+", 10, 8),
            token_factory(TokenType.INT_LITERAL, 2, 10, 10),
            token_factory(TokenType.RPAREN, ")", 10, 11),
            token_factory(TokenType.RPAREN, ")", 10, 12),
            eof_token(10, 13),
        ]

        builder = ASTBuilder(tokens)
        with pytest.raises(PineSyntaxError) as exc_info:
            builder.build()

        err = exc_info.value
        assert err.line == 10
        assert err.column == 12

    def test_orphan_else_without_preceding_if(self, token_factory):
        # else
        #     x = 10
        tokens = [
            token_factory(TokenType.ELSE, "else", 11, 1),
            token_factory(TokenType.NEWLINE, "\n", 11, 5),
            token_factory(TokenType.INDENT, "", 12, 1),
            token_factory(TokenType.IDENTIFIER, "x", 12, 5),
            token_factory(TokenType.ASSIGN, "=", 12, 7),
            token_factory(TokenType.INT_LITERAL, 10, 12, 9),
            eof_token(12, 11),
        ]

        builder = ASTBuilder(tokens)
        with pytest.raises(PineSyntaxError) as exc_info:
            builder.build()

        err = exc_info.value
        assert err.line == 11
        assert err.column == 1


# ============================================================================
# Operator Precedence & Complex Expression AST Generation
# ============================================================================


class TestExpressionPrecedenceParsing:
    """Verifies that the AST generator respects mathematical and logical operator precedence."""

    def test_multiplication_has_higher_precedence_than_addition(self, token_factory):
        # res = 1 + 2 * 3
        # AST should be: 1 + (2 * 3)
        tokens = [
            token_factory(TokenType.IDENTIFIER, "res", 1, 1),
            token_factory(TokenType.ASSIGN, "=", 1, 5),
            token_factory(TokenType.INT_LITERAL, 1, 1, 7),
            token_factory(TokenType.PLUS, "+", 1, 9),
            token_factory(TokenType.INT_LITERAL, 2, 1, 11),
            token_factory(TokenType.STAR, "*", 1, 13),
            token_factory(TokenType.INT_LITERAL, 3, 1, 15),
            eof_token(1, 16),
        ]

        ast = ASTBuilder(tokens).build()
        decl = ast.statements[0]
        init = decl.initializer

        assert isinstance(init, BinaryOp)
        assert init.op == "+"
        assert isinstance(init.left, Literal)
        assert init.left.value == 1

        assert isinstance(init.right, BinaryOp)
        assert init.right.op == "*"
        assert init.right.left.value == 2
        assert init.right.right.value == 3

    def test_parenthesized_expression_overrides_precedence(self, token_factory):
        # res = (1 + 2) * 3
        # AST should be: (1 + 2) * 3
        tokens = [
            token_factory(TokenType.IDENTIFIER, "res", 1, 1),
            token_factory(TokenType.ASSIGN, "=", 1, 5),
            token_factory(TokenType.LPAREN, "(", 1, 7),
            token_factory(TokenType.INT_LITERAL, 1, 1, 8),
            token_factory(TokenType.PLUS, "+", 1, 10),
            token_factory(TokenType.INT_LITERAL, 2, 1, 12),
            token_factory(TokenType.RPAREN, ")", 1, 13),
            token_factory(TokenType.STAR, "*", 1, 15),
            token_factory(TokenType.INT_LITERAL, 3, 1, 17),
            eof_token(1, 18),
        ]

        ast = ASTBuilder(tokens).build()
        decl = ast.statements[0]
        init = decl.initializer

        assert isinstance(init, BinaryOp)
        assert init.op == "*"
        assert isinstance(init.left, BinaryOp)
        assert init.left.op == "+"
        assert init.left.left.value == 1
        assert init.left.right.value == 2
        assert isinstance(init.right, Literal)
        assert init.right.value == 3

    def test_unary_not_and_minus_expressions(self, token_factory):
        # bool neg = not flag
        tokens = [
            token_factory(TokenType.TYPE, "bool", 1, 1),
            token_factory(TokenType.IDENTIFIER, "neg", 1, 6),
            token_factory(TokenType.ASSIGN, "=", 1, 10),
            token_factory(TokenType.NOT, "not", 1, 12),
            token_factory(TokenType.IDENTIFIER, "flag", 1, 16),
            eof_token(1, 20),
        ]

        ast = ASTBuilder(tokens).build()
        decl = ast.statements[0]
        assert isinstance(decl.initializer, UnaryOp)
        assert decl.initializer.op == "not"
        assert isinstance(decl.initializer.operand, Identifier)
        assert decl.initializer.operand.name == "flag"


# ============================================================================
# Edge Cases & Boundary Conditions
# ============================================================================


class TestASTBuilderEdgeCases:
    """Validates boundary conditions, empty token streams, and multiple statement programs."""

    def test_empty_program(self):
        # Empty stream with only EOF
        tokens = [eof_token(1, 1)]
        ast = ASTBuilder(tokens).build()
        assert isinstance(ast, Program)
        assert len(ast.statements) == 0

    def test_multiple_top_level_statements(self, token_factory):
        # int a = 1
        # int b = 2
        # if a == b
        #     c = 3
        tokens = [
            token_factory(TokenType.TYPE, "int", 1, 1),
            token_factory(TokenType.IDENTIFIER, "a", 1, 5),
            token_factory(TokenType.ASSIGN, "=", 1, 7),
            token_factory(TokenType.INT_LITERAL, 1, 1, 9),
            token_factory(TokenType.NEWLINE, "\n", 1, 10),
            token_factory(TokenType.TYPE, "int", 2, 1),
            token_factory(TokenType.IDENTIFIER, "b", 2, 5),
            token_factory(TokenType.ASSIGN, "=", 2, 7),
            token_factory(TokenType.INT_LITERAL, 2, 2, 9),
            token_factory(TokenType.NEWLINE, "\n", 2, 10),
            token_factory(TokenType.IF, "if", 3, 1),
            token_factory(TokenType.IDENTIFIER, "a", 3, 4),
            token_factory(TokenType.EQUAL, "==", 3, 6),
            token_factory(TokenType.IDENTIFIER, "b", 3, 9),
            token_factory(TokenType.NEWLINE, "\n", 3, 10),
            token_factory(TokenType.INDENT, "", 4, 1),
            token_factory(TokenType.IDENTIFIER, "c", 4, 5),
            token_factory(TokenType.ASSIGN, "=", 4, 7),
            token_factory(TokenType.INT_LITERAL, 3, 4, 9),
            token_factory(TokenType.NEWLINE, "\n", 4, 10),
            token_factory(TokenType.DEDENT, "", 5, 1),
            eof_token(5, 1),
        ]

        ast = ASTBuilder(tokens).build()
        assert len(ast.statements) == 3
        assert isinstance(ast.statements[0], VarDeclaration)
        assert isinstance(ast.statements[1], VarDeclaration)
        assert isinstance(ast.statements[2], IfStatement)