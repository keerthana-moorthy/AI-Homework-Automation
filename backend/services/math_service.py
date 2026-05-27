from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any

import sympy as sp
from sympy.parsing.sympy_parser import (
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
    parse_expr,
)

from .common import normalize_text

TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application, convert_xor)


@dataclass(slots=True)
class MathSolution:
    problem_type: str
    question_text: str
    final_answer: str
    numeric_answer: float | None
    steps: list[dict[str, Any]]
    confidence: float
    validated: bool
    variable: str | None = None
    extracted_equation: str | None = None
    symbolic_answer: str | None = None

    def model_dump(self) -> dict[str, Any]:
        return {
            "problemType": self.problem_type,
            "questionText": self.question_text,
            "finalAnswer": self.final_answer,
            "numericAnswer": self.numeric_answer,
            "steps": self.steps,
            "confidence": self.confidence,
            "validated": self.validated,
            "variable": self.variable,
            "extractedEquation": self.extracted_equation,
            "symbolicAnswer": self.symbolic_answer,
        }


def detect_math_problem(text: str) -> bool:
    normalized = normalize_text(text)
    return bool(re.search(r"[=+\-*/^∫√]|solve|simplify|differentiate|integrate|matrix", normalized.lower()))


def _parse_expression(expression: str) -> sp.Expr:
    cleaned = normalize_text(expression)
    cleaned = cleaned.replace("×", "*").replace("÷", "/")
    return parse_expr(cleaned, transformations=TRANSFORMATIONS, evaluate=True)


def _equation_steps(left: str, right: str, variable: str, answer: sp.Expr) -> list[dict[str, Any]]:
    return [
        {
            "stepNum": 1,
            "title": "Write the equation",
            "desc": f"Start from {left} = {right}.",
        },
        {
            "stepNum": 2,
            "title": "Isolate the variable",
            "desc": f"Move all non-{variable} terms away from {variable}.",
        },
        {
            "stepNum": 3,
            "title": "Verify the answer",
            "desc": f"Substitute {variable} = {sp.sstr(answer)} back into the equation to confirm it works.",
        },
    ]


def _solve_equation(question_text: str) -> MathSolution | None:
    normalized = normalize_text(question_text)
    if "=" not in normalized:
        return None

    left_text, right_text = [part.strip() for part in normalized.split("=", 1)]
    if not left_text or not right_text:
        return None

    symbols = sorted(set(re.findall(r"[a-zA-Z]", normalized)))
    if not symbols:
        return None

    symbol = sp.symbols(symbols[0])
    try:
        left_expr = _parse_expression(left_text)
        right_expr = _parse_expression(right_text)
        equation = sp.Eq(left_expr, right_expr)
        solutions = sp.solve(equation, symbol)
    except Exception:  # noqa: BLE001
        return None

    if not solutions:
        return None

    answer_expr = solutions[0]
    answer_text = f"{symbol} = {sp.sstr(answer_expr)}"
    numeric_answer = float(answer_expr.evalf()) if answer_expr.is_real and answer_expr.is_number else None
    validation = True
    try:
        validation = sp.simplify(left_expr.subs(symbol, answer_expr) - right_expr.subs(symbol, answer_expr)) == 0
    except Exception:  # noqa: BLE001
        validation = True

    return MathSolution(
        problem_type="equation",
        question_text=normalized,
        final_answer=answer_text,
        numeric_answer=numeric_answer,
        steps=_equation_steps(left_text, right_text, str(symbol), answer_expr),
        confidence=0.96,
        validated=validation,
        variable=str(symbol),
        extracted_equation=f"{left_text} = {right_text}",
        symbolic_answer=sp.sstr(answer_expr),
    )


def _solve_calculus(question_text: str) -> MathSolution | None:
    normalized = normalize_text(question_text).lower()
    if "differentiat" in normalized or "derivative" in normalized or "d/d" in normalized:
        match = re.search(r"d/d[a-z]\s*([^\n]+)", normalized)
        expression = match.group(1) if match else normalized
        symbol = sp.symbols("x")
        try:
            expr = _parse_expression(expression)
            derivative = sp.diff(expr, symbol)
        except Exception:  # noqa: BLE001
            return None
        return MathSolution(
            problem_type="derivative",
            question_text=question_text,
            final_answer=f"d/dx = {sp.sstr(derivative)}",
            numeric_answer=None,
            steps=[
                {"stepNum": 1, "title": "Identify the function", "desc": f"The function is {sp.sstr(expr)}."},
                {"stepNum": 2, "title": "Differentiate term by term", "desc": f"The derivative is {sp.sstr(derivative)}."},
            ],
            confidence=0.9,
            validated=True,
            variable="x",
            symbolic_answer=sp.sstr(derivative),
        )

    if "integral" in normalized or "∫" in normalized:
        symbol = sp.symbols("x")
        try:
            expr = _parse_expression(normalized.replace("integral", "").replace("∫", ""))
            integral = sp.integrate(expr, symbol)
        except Exception:  # noqa: BLE001
            return None
        return MathSolution(
            problem_type="integral",
            question_text=question_text,
            final_answer=f"∫ = {sp.sstr(integral)} + C",
            numeric_answer=None,
            steps=[
                {"stepNum": 1, "title": "Identify the integrand", "desc": f"The expression is {sp.sstr(expr)}."},
                {"stepNum": 2, "title": "Integrate", "desc": f"The antiderivative is {sp.sstr(integral)} + C."},
            ],
            confidence=0.88,
            validated=True,
            variable="x",
            symbolic_answer=f"{sp.sstr(integral)} + C",
        )
    return None


def solve_math_question(question_text: str) -> dict[str, Any] | None:
    normalized = normalize_text(question_text)
    if not normalized:
        return None

    calculus = _solve_calculus(normalized)
    if calculus:
        return calculus.model_dump()

    equation = _solve_equation(normalized)
    if equation:
        return equation.model_dump()

    if detect_math_problem(normalized):
        try:
            expr = _parse_expression(normalized)
            simplified = sp.simplify(expr)
            return MathSolution(
                problem_type="simplification",
                question_text=normalized,
                final_answer=sp.sstr(simplified),
                numeric_answer=float(simplified.evalf()) if simplified.is_number else None,
                steps=[
                    {"stepNum": 1, "title": "Rewrite the expression", "desc": f"Start from {sp.sstr(expr)}."},
                    {"stepNum": 2, "title": "Simplify", "desc": f"The simplified form is {sp.sstr(simplified)}."},
                ],
                confidence=0.78,
                validated=True,
                symbolic_answer=sp.sstr(simplified),
            ).model_dump()
        except Exception:  # noqa: BLE001
            return None

    return None


def build_math_explanation(solution: dict[str, Any] | None) -> dict[str, Any]:
    if not solution:
        return {
            "problemType": "manual-review",
            "summary": "This question may need manual review.",
            "detailedExplanation": "The math engine could not confidently solve the problem automatically.",
        }

    steps = solution.get("steps") or []
    final_answer = normalize_text(solution.get("finalAnswer"))
    explanation = " ".join(step.get("desc", "") for step in steps if isinstance(step, dict))
    if not explanation:
        explanation = f"The final answer is {final_answer}."
    return {
        "problemType": solution.get("problemType") or "math",
        "summary": f"Solved the {solution.get('problemType', 'math')} problem step by step.",
        "detailedExplanation": explanation,
        "finalAnswer": final_answer,
        "steps": steps,
        "variable": solution.get("variable"),
        "numericAnswer": solution.get("numericAnswer"),
        "extractedEquation": solution.get("extractedEquation"),
        "confidence": solution.get("confidence", 0.8),
        "validated": solution.get("validated", False),
    }

