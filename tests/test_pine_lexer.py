import pytest
from src.compiler.pine.tokens import Token, TokenType
from src.compiler.pine.lexer import PineScriptLexer, LexerError


class TestPineScriptLexerTokens:
    """Unit tests validating token generation, keyword recognition, literals, and operators."""

    @pytest.fixture
    def lexer(self) -> PineScriptLexer:
        return PineScriptLexer()

    def test_tokenize_empty_source(self, lexer: PineScriptLexer):
        source = ""
        tokens = lexer.tokenize(source)

        assert len(tokens) == 1
        assert tokens[0].type == TokenType.EOF
        assert tokens[0].line == 1
        assert tokens[0].column == 1

    def test_tokenize_simple_assignment_and_identifiers(self, lexer: PineScriptLexer):
        source = "my_var = 42"
        tokens = lexer.tokenize(source)

        assert len(tokens) == 4  # IDENTIFIER, ASSIGN, INT, EOF
        assert tokens[0] == Token(
            type=TokenType.IDENTIFIER, value="my_var", line=1, column=1
        )
        assert tokens[1] == Token(
            type=TokenType.ASSIGN, value="=", line=1, column=8
        )
        assert tokens[2] == Token(
            type=TokenType.INT, value=42, line=1, column=10
        )
        assert tokens[3].type == TokenType.EOF

    def test_tokenize_keywords(self, lexer: PineScriptLexer):
        source = "indicator strategy if else for to by while var varip"
        tokens = lexer.tokenize(source)

        expected_tokens = [
            (TokenType.INDICATOR, "indicator", 1, 1),
            (TokenType.STRATEGY, "strategy", 1, 11),
            (TokenType.IF, "if", 1, 20),
            (TokenType.ELSE, "else", 1, 23),
            (TokenType.FOR, "for", 1, 28),
            (TokenType.TO, "to", 1, 32),
            (TokenType.BY, "by", 1, 35),
            (TokenType.WHILE, "while", 1, 38),
            (TokenType.VAR, "var", 1, 44),
            (TokenType.VARIP, "varip", 1, 48),
        ]

        assert len(tokens) == len(expected_tokens) + 1  # Including EOF
        for token, (exp_type, exp_val, exp_line, exp_col) in zip(
            tokens, expected_tokens
        ):
            assert token.type == exp_type
            assert token.value == exp_val
            assert token.line == exp_line
            assert token.column == exp_col

    def test_tokenize_literals(self, lexer: PineScriptLexer):
        source = '10 3.14159 "pine script" \'v5 literal\' true false na'
        tokens = lexer.tokenize(source)

        expected = [
            (TokenType.INT, 10, 1, 1),
            (TokenType.FLOAT, 3.14159, 1, 4),
            (TokenType.STRING, "pine script", 1, 12),
            (TokenType.STRING, "v5 literal", 1, 26),
            (TokenType.BOOL, True, 1, 39),
            (TokenType.BOOL, False, 1, 44),
            (TokenType.NA, "na", 1, 50),
        ]

        for token, (exp_type, exp_val, exp_line, exp_col) in zip(
            tokens, expected
        ):
            assert token.type == exp_type
            assert token.value == exp_val
            assert token.line == exp_line
            assert token.column == exp_col

    def test_tokenize_series_subscript(self, lexer: PineScriptLexer):
        source = "close[1]"
        tokens = lexer.tokenize(source)

        assert len(tokens) == 5  # IDENTIFIER, LBRACKET, INT, RBRACKET, EOF
        assert tokens[0] == Token(
            type=TokenType.IDENTIFIER, value="close", line=1, column=1
        )
        assert tokens[1] == Token(
            type=TokenType.LBRACKET, value="[", line=1, column=6
        )
        assert tokens[2] == Token(
            type=TokenType.INT, value=1, line=1, column=7
        )
        assert tokens[3] == Token(
            type=TokenType.RBRACKET, value="]", line=1, column=8
        )
        assert tokens[4].type == TokenType.EOF

    def test_tokenize_multi_character_operators(self, lexer: PineScriptLexer):
        source = ":= => == != <= >="
        tokens = lexer.tokenize(source)

        expected = [
            (TokenType.REASSIGN, ":=", 1, 1),
            (TokenType.ARROW, "=>", 1, 4),
            (TokenType.EQ, "==", 1, 7),
            (TokenType.NEQ, "!=", 1, 10),
            (TokenType.LE, "<=", 1, 13),
            (TokenType.GE, ">=", 1, 16),
        ]

        assert len(tokens) == len(expected) + 1
        for token, (exp_type, exp_val, exp_line, exp_col) in zip(
            tokens, expected
        ):
            assert token.type == exp_type
            assert token.value == exp_val
            assert token.line == exp_line
            assert token.column == exp_col

    def test_tokenize_single_character_operators(self, lexer: PineScriptLexer):
        source = "+ - * / % < > ( ) ,"
        tokens = lexer.tokenize(source)

        expected_types = [
            TokenType.PLUS,
            TokenType.MINUS,
            TokenType.STAR,
            TokenType.SLASH,
            TokenType.PERCENT,
            TokenType.LT,
            TokenType.GT,
            TokenType.LPAREN,
            TokenType.RPAREN,
            TokenType.COMMA,
        ]

        for token, exp_type in zip(tokens, expected_types):
            assert token.type == exp_type


class TestPineScriptLexerWhitespaceAndComments:
    """Unit tests validating comments, whitespace handling, and indentation tracking."""

    @pytest.fixture
    def lexer(self) -> PineScriptLexer:
        return PineScriptLexer()

    def test_tokenize_single_line_comments_ignored(
        self, lexer: PineScriptLexer
    ):
        source = """// Top level comment
x = 10 // Inline comment
// Bottom level comment"""
        tokens = lexer.tokenize(source)

        # Comments should not produce tokens in standard expression streams
        token_types = [t.type for t in tokens]
        assert TokenType.IDENTIFIER in token_types
        assert TokenType.ASSIGN in token_types
        assert TokenType.INT in token_types

        # Verify line tracking continues correctly past comments
        id_token = [t for t in tokens if t.type == TokenType.IDENTIFIER][0]
        assert id_token.value == "x"
        assert id_token.line == 2
        assert id_token.column == 1

    def test_tokenize_compiler_directive_comment(self, lexer: PineScriptLexer):
        source = "//@version=5\nindicator('My Script')"
        tokens = lexer.tokenize(source)

        # The directive should either be emitted as a compiler directive token
        # or properly skipped while preserving line coordinates for the next tokens.
        first_meaningful_token = tokens[0]
        if first_meaningful_token.type == TokenType.COMPILER_DIRECTIVE:
            assert first_meaningful_token.value == "//@version=5"
            assert first_meaningful_token.line == 1
            indicator_token = tokens[1]
        else:
            indicator_token = first_meaningful_token

        assert indicator_token.type == TokenType.INDICATOR
        assert indicator_token.line == 2
        assert indicator_token.column == 1

    def test_tokenize_indentation_and_dedentation(
        self, lexer: PineScriptLexer
    ):
        source = (
            "if close > open\n"
            "    x := 1\n"
            "y = 2"
        )
        tokens = lexer.tokenize(source)

        token_types = [t.type for t in tokens]
        assert TokenType.INDENT in token_types
        assert TokenType.DEDENT in token_types

        indent_token = tokens[token_types.index(TokenType.INDENT)]
        assert indent_token.line == 2
        assert indent_token.column == 1

        dedent_token = tokens[token_types.index(TokenType.DEDENT)]
        assert dedent_token.line == 3
        assert dedent_token.column == 1

    def test_tokenize_nested_indentation(self, lexer: PineScriptLexer):
        source = (
            "if true\n"
            "    if true\n"
            "        x := 1\n"
            "y = 2"
        )
        tokens = lexer.tokenize(source)
        token_types = [t.type for t in tokens]

        # Should produce two INDENT tokens and two DEDENT tokens
        assert token_types.count(TokenType.INDENT) == 2
        assert token_types.count(TokenType.DEDENT) == 2

    def test_tokenize_multiline_coordinates_preserved(
        self, lexer: PineScriptLexer
    ):
        source = "a = 1\nb = 2\n\nc = 3"
        tokens = lexer.tokenize(source)

        identifiers = [t for t in tokens if t.type == TokenType.IDENTIFIER]
        assert len(identifiers) == 3

        assert identifiers[0].value == "a"
        assert identifiers[0].line == 1
        assert identifiers[0].column == 1

        assert identifiers[1].value == "b"
        assert identifiers[1].line == 2
        assert identifiers[1].column == 1

        assert identifiers[2].value == "c"
        assert identifiers[2].line == 4
        assert identifiers[2].column == 1


class TestPineScriptLexerErrors:
    """Unit tests validating LexerError exceptions on unrecognized or malformed tokens."""

    @pytest.fixture
    def lexer(self) -> PineScriptLexer:
        return PineScriptLexer()

    def test_invalid_character_raises_lexer_error(
        self, lexer: PineScriptLexer
    ):
        source = "x = $100"
        with pytest.raises(LexerError) as exc_info:
            lexer.tokenize(source)

        assert exc_info.value.line == 1
        assert exc_info.value.column == 5

    def test_invalid_character_on_multiline_raises_correct_coordinates(
        self, lexer: PineScriptLexer
    ):
        source = "a = 1\nb = 2\nc = ^"
        with pytest.raises(LexerError) as exc_info:
            lexer.tokenize(source)

        assert exc_info.value.line == 3
        assert exc_info.value.column == 5

    def test_unclosed_single_quote_string_raises_lexer_error(
        self, lexer: PineScriptLexer
    ):
        source = "val = 'unclosed string\nnext = 1"
        with pytest.raises(LexerError) as exc_info:
            lexer.tokenize(source)

        assert exc_info.value.line == 1
        assert exc_info.value.column == 7

    def test_unclosed_double_quote_string_raises_lexer_error(
        self, lexer: PineScriptLexer
    ):
        source = 'val = "unclosed double quote'
        with pytest.raises(LexerError) as exc_info:
            lexer.tokenize(source)

        assert exc_info.value.line == 1
        assert exc_info.value.column == 7

    def test_inconsistent_dedent_raises_lexer_error(
        self, lexer: PineScriptLexer
    ):
        source = (
            "if true\n"
            "    x = 1\n"
            "  y = 2"
        )
        with pytest.raises(LexerError) as exc_info:
            lexer.tokenize(source)

        assert exc_info.value.line == 3
        assert exc_info.value.column == 3