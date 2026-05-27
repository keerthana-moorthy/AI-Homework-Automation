from __future__ import annotations

import asyncio
import logging
import time
from functools import lru_cache
from typing import Any, Iterable

from ..config import GROQ_API_KEY
from .common import normalize_text, safe_json_loads

try:  # Optional dependency.
    from groq import Groq  # type: ignore
except ImportError:  # pragma: no cover - handled at runtime.
    Groq = None


LOGGER = logging.getLogger(__name__)

MODEL_ROUTING = {
    "ocr_cleanup": "llama-3.1-8b-instant",
    "classification": "llama-3.1-8b-instant",
    "translation": "llama-3.1-8b-instant",
    "chat": "llama-3.3-70b-versatile",
    "explanation": "llama-3.3-70b-versatile",
    "quiz": "llama-3.3-70b-versatile",
    "doubt": "llama-3.3-70b-versatile",
    "recommendation": "llama-3.1-8b-instant",
}


class LLMRouter:
    def __init__(self) -> None:
        self._client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY and Groq is not None else None

    @property
    def configured(self) -> bool:
        return self._client is not None

    def model_for(self, task: str, fallback: str | None = None) -> str:
        return MODEL_ROUTING.get(task, fallback or MODEL_ROUTING["chat"])

    def _call_completion(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        temperature: float = 0.3,
        max_completion_tokens: int = 1200,
        response_format: dict[str, str] | None = None,
        stream: bool = False,
        retries: int = 3,
    ) -> Any:
        if self._client is None:
            raise RuntimeError("Groq is not configured.")

        last_error: Exception | None = None
        for attempt in range(retries):
            try:
                return self._client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_completion_tokens=max_completion_tokens,
                    top_p=1,
                    stream=stream,
                    response_format=response_format,
                )
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                sleep_for = 0.25 * (2**attempt)
                LOGGER.warning("LLM call failed, retrying in %.2fs: %s", sleep_for, exc)
                time.sleep(sleep_for)

        if last_error is not None:
            raise last_error
        raise RuntimeError("LLM call failed without an explicit error.")

    def generate_text(
        self,
        *,
        task: str,
        system_prompt: str,
        user_prompt: str,
        context_messages: Iterable[dict[str, Any]] | None = None,
        model: str | None = None,
        temperature: float = 0.3,
        max_completion_tokens: int = 1200,
    ) -> str | None:
        if self._client is None:
            return None

        messages = [{"role": "system", "content": system_prompt}]
        if context_messages:
            messages.extend(list(context_messages))
        messages.append({"role": "user", "content": user_prompt})

        try:
            completion = self._call_completion(
                model=model or self.model_for(task),
                messages=messages,
                temperature=temperature,
                max_completion_tokens=max_completion_tokens,
            )
            return normalize_text(completion.choices[0].message.content if completion.choices else "")
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("LLM text generation unavailable: %s", exc)
            return None

    def generate_json(
        self,
        *,
        task: str,
        system_prompt: str,
        user_prompt: str,
        context_messages: Iterable[dict[str, Any]] | None = None,
        model: str | None = None,
        temperature: float = 0.2,
        max_completion_tokens: int = 1400,
    ) -> dict[str, Any] | None:
        if self._client is None:
            return None

        messages = [{"role": "system", "content": system_prompt}]
        if context_messages:
            messages.extend(list(context_messages))
        messages.append({"role": "user", "content": user_prompt})

        try:
            completion = self._call_completion(
                model=model or self.model_for(task),
                messages=messages,
                temperature=temperature,
                max_completion_tokens=max_completion_tokens,
                response_format={"type": "json_object"},
            )
            content = completion.choices[0].message.content if completion.choices else "{}"
            parsed = safe_json_loads(content, default={})
            return parsed if isinstance(parsed, dict) else {}
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("LLM JSON generation unavailable: %s", exc)
            return None

    async def stream_text(
        self,
        *,
        task: str,
        system_prompt: str,
        user_prompt: str,
        context_messages: Iterable[dict[str, Any]] | None = None,
        model: str | None = None,
        temperature: float = 0.3,
        max_completion_tokens: int = 1200,
    ):
        if self._client is None:
            return

        messages = [{"role": "system", "content": system_prompt}]
        if context_messages:
            messages.extend(list(context_messages))
        messages.append({"role": "user", "content": user_prompt})

        try:
            completion = self._call_completion(
                model=model or self.model_for(task),
                messages=messages,
                temperature=temperature,
                max_completion_tokens=max_completion_tokens,
                stream=True,
            )
            for chunk in completion:
                delta = getattr(chunk.choices[0], "delta", None)
                content = normalize_text(getattr(delta, "content", None))
                if content:
                    yield content
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("LLM stream generation unavailable: %s", exc)
            return


@lru_cache(maxsize=1)
def get_llm_router() -> LLMRouter:
    return LLMRouter()


def is_llm_configured() -> bool:
    return get_llm_router().configured


async def generate_text_async(**kwargs: Any) -> str | None:
    router = get_llm_router()
    return await asyncio.to_thread(router.generate_text, **kwargs)


async def generate_json_async(**kwargs: Any) -> dict[str, Any] | None:
    router = get_llm_router()
    return await asyncio.to_thread(router.generate_json, **kwargs)
