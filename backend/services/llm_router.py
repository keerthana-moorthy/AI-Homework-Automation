from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable
from urllib import error as urlerror
from urllib import request as urlrequest

from ..config import (
    GROQ_API_KEY,
    HUGGINGFACE_API_KEY,
    HUGGINGFACE_BASE_URL,
    HUGGINGFACE_MODEL,
    HUGGINGFACE_VISION_MODEL,
    LLM_PROVIDER,
)
from .common import normalize_text, safe_json_loads

try:  # Optional dependency.
    from groq import Groq  # type: ignore
except ImportError:  # pragma: no cover - handled at runtime.
    Groq = None


LOGGER = logging.getLogger(__name__)

GROQ_MODEL_ROUTING = {
    "ocr_cleanup": "llama-3.1-8b-instant",
    "classification": "llama-3.1-8b-instant",
    "translation": "llama-3.1-8b-instant",
    "chat": "llama-3.3-70b-versatile",
    "explanation": "llama-3.3-70b-versatile",
    "quiz": "llama-3.3-70b-versatile",
    "doubt": "llama-3.3-70b-versatile",
    "recommendation": "llama-3.1-8b-instant",
}

HUGGINGFACE_MODEL_ROUTING = {task: HUGGINGFACE_MODEL for task in GROQ_MODEL_ROUTING}
HUGGINGFACE_MODEL_ROUTING["ocr_cleanup"] = HUGGINGFACE_VISION_MODEL


@dataclass(slots=True)
class CompletionMessage:
    content: str | None


@dataclass(slots=True)
class CompletionChoice:
    message: CompletionMessage


@dataclass(slots=True)
class CompletionResult:
    choices: list[CompletionChoice]
    model: str | None = None
    raw: Any = None


def _normalize_provider_choice(value: str | None) -> str:
    normalized = normalize_text(value).lower()
    if normalized in {"huggingface", "hf", "hugging face"}:
        return "huggingface"
    if normalized == "groq":
        return "groq"
    return "auto"


class LLMRouter:
    def __init__(self) -> None:
        self._groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY and Groq is not None else None
        self._client = self._groq_client  # Backwards-compatible alias for older call sites.
        self._hf_api_key = HUGGINGFACE_API_KEY
        self._hf_base_url = HUGGINGFACE_BASE_URL.rstrip("/")
        self._provider_preference = _normalize_provider_choice(LLM_PROVIDER)

    @property
    def groq_configured(self) -> bool:
        return self._groq_client is not None

    @property
    def huggingface_configured(self) -> bool:
        return bool(self._hf_api_key)

    @property
    def configured(self) -> bool:
        return self.groq_configured or self.huggingface_configured

    @property
    def preferred_provider(self) -> str:
        return self._provider_preference

    @property
    def provider_name(self) -> str:
        order = self._provider_order()
        return order[0] if order else "none"

    def _provider_available(self, provider: str) -> bool:
        if provider == "huggingface":
            return self.huggingface_configured
        if provider == "groq":
            return self.groq_configured
        return False

    def _provider_order(self, preferred: str | None = None) -> list[str]:
        choice = _normalize_provider_choice(preferred or self._provider_preference)
        if choice == "groq":
            order = ["groq", "huggingface"]
        else:
            order = ["huggingface", "groq"]
        return [provider for provider in order if self._provider_available(provider)]

    def model_for(self, task: str, fallback: str | None = None, provider: str | None = None) -> str:
        provider_name = _normalize_provider_choice(provider or self.provider_name)
        if provider_name == "huggingface":
            return HUGGINGFACE_MODEL_ROUTING.get(task, fallback or HUGGINGFACE_MODEL)
        return GROQ_MODEL_ROUTING.get(task, fallback or GROQ_MODEL_ROUTING["chat"])

    def _response_format_for_provider(
        self,
        provider: str,
        response_format: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if not response_format:
            return None
        if provider != "huggingface":
            return response_format

        response_type = str(response_format.get("type") or "").strip().lower()
        if response_type == "json_schema":
            return response_format
        if response_type == "json_object":
            return {
                "type": "json_schema",
                "json_schema": {
                    "name": "JsonObject",
                    "schema": {
                        "type": "object",
                        "additionalProperties": True,
                    },
                    "strict": False,
                },
            }
        return response_format

    def _wrap_completion_response(self, completion: Any, *, fallback_model: str | None = None) -> CompletionResult:
        content = ""
        model_name = fallback_model

        if isinstance(completion, CompletionResult):
            return completion

        if isinstance(completion, dict):
            model_name = str(completion.get("model") or model_name or "") or None
            choices = completion.get("choices") or []
            if choices and isinstance(choices[0], dict):
                message = choices[0].get("message") or {}
                if isinstance(message, dict):
                    content = normalize_text(message.get("content"))
                if not content:
                    delta = choices[0].get("delta") or {}
                    if isinstance(delta, dict):
                        content = normalize_text(delta.get("content"))
            if not content:
                content = normalize_text(completion.get("output_text") or completion.get("generated_text"))
            return CompletionResult(
                choices=[CompletionChoice(message=CompletionMessage(content=content))],
                model=model_name,
                raw=completion,
            )

        model_name = str(getattr(completion, "model", None) or model_name or "") or None
        choices = getattr(completion, "choices", None)
        if choices:
            first_choice = choices[0]
            message = getattr(first_choice, "message", None)
            if message is not None:
                content = normalize_text(getattr(message, "content", None))
            if not content:
                delta = getattr(first_choice, "delta", None)
                if delta is not None:
                    content = normalize_text(getattr(delta, "content", None))
        if not content:
            content = normalize_text(getattr(completion, "output_text", None) or getattr(completion, "generated_text", None))
        return CompletionResult(
            choices=[CompletionChoice(message=CompletionMessage(content=content))],
            model=model_name,
            raw=completion,
        )

    def _call_groq_completion(
        self,
        *,
        task: str,
        messages: list[dict[str, Any]],
        temperature: float,
        max_completion_tokens: int,
        response_format: dict[str, Any] | None,
        model: str | None,
    ) -> CompletionResult:
        if self._groq_client is None:
            raise RuntimeError("Groq is not configured.")

        completion = self._groq_client.chat.completions.create(
            model=model or self.model_for(task, provider="groq"),
            messages=messages,
            temperature=temperature,
            max_completion_tokens=max_completion_tokens,
            top_p=1,
            stream=False,
            response_format=response_format,
        )
        return self._wrap_completion_response(completion, fallback_model=model)

    def _call_huggingface_completion(
        self,
        *,
        task: str,
        messages: list[dict[str, Any]],
        temperature: float,
        max_completion_tokens: int,
        response_format: dict[str, Any] | None,
        model: str | None,
    ) -> CompletionResult:
        if not self._hf_api_key:
            raise RuntimeError("Hugging Face is not configured.")

        model_name = model or self.model_for(task, provider="huggingface")
        payload: dict[str, Any] = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_completion_tokens,
            "top_p": 1,
            "stream": False,
        }

        response_format = self._response_format_for_provider("huggingface", response_format)
        if response_format is not None:
            payload["response_format"] = response_format

        request_obj = urlrequest.Request(
            f"{self._hf_base_url}/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._hf_api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "VidyaAI/1.0",
            },
            method="POST",
        )

        try:
            with urlrequest.urlopen(request_obj, timeout=120) as response:
                response_body = response.read().decode("utf-8")
        except urlerror.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Hugging Face request failed with {exc.code} {exc.reason}: {error_body[:500]}"
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Hugging Face request failed: {exc}") from exc

        parsed = safe_json_loads(response_body, default={})
        if not isinstance(parsed, dict):
            parsed = {}
        return self._wrap_completion_response(parsed, fallback_model=model_name)

    def complete(
        self,
        *,
        task: str,
        messages: list[dict[str, Any]],
        temperature: float = 0.3,
        max_completion_tokens: int = 1200,
        response_format: dict[str, Any] | None = None,
        stream: bool = False,
        retries: int = 3,
        model: str | None = None,
        provider: str | None = None,
    ) -> CompletionResult:
        del stream  # Streaming is handled separately by stream_text.

        provider_order = self._provider_order(provider)
        if not provider_order:
            raise RuntimeError("No LLM providers are configured.")

        last_error: Exception | None = None
        for provider_name in provider_order:
            for attempt in range(max(1, retries)):
                try:
                    if provider_name == "huggingface":
                        return self._call_huggingface_completion(
                            task=task,
                            messages=messages,
                            temperature=temperature,
                            max_completion_tokens=max_completion_tokens,
                            response_format=response_format,
                            model=model,
                        )
                    return self._call_groq_completion(
                        task=task,
                        messages=messages,
                        temperature=temperature,
                        max_completion_tokens=max_completion_tokens,
                        response_format=response_format,
                        model=model,
                    )
                except Exception as exc:  # noqa: BLE001
                    last_error = exc
                    sleep_for = 0.25 * (2**attempt)
                    LOGGER.warning("LLM call failed via %s, retrying in %.2fs: %s", provider_name, sleep_for, exc)
                    time.sleep(sleep_for)
            LOGGER.warning("LLM provider %s exhausted retries; trying fallback provider if available.", provider_name)

        if last_error is not None:
            raise last_error
        raise RuntimeError("LLM call failed without an explicit error.")

    def _completion_content(self, completion: CompletionResult) -> str:
        if not completion.choices:
            return ""
        return normalize_text(completion.choices[0].message.content)

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
        if not self.configured:
            return None

        messages = [{"role": "system", "content": system_prompt}]
        if context_messages:
            messages.extend(list(context_messages))
        messages.append({"role": "user", "content": user_prompt})

        try:
            completion = self.complete(
                task=task,
                messages=messages,
                temperature=temperature,
                max_completion_tokens=max_completion_tokens,
                model=model,
            )
            return self._completion_content(completion)
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
        if not self.configured:
            return None

        messages = [{"role": "system", "content": system_prompt}]
        if context_messages:
            messages.extend(list(context_messages))
        messages.append({"role": "user", "content": user_prompt})

        try:
            completion = self.complete(
                task=task,
                messages=messages,
                temperature=temperature,
                max_completion_tokens=max_completion_tokens,
                response_format={"type": "json_object"},
                model=model,
            )
            content = self._completion_content(completion)
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
        if not self.configured:
            return

        messages = [{"role": "system", "content": system_prompt}]
        if context_messages:
            messages.extend(list(context_messages))
        messages.append({"role": "user", "content": user_prompt})

        try:
            provider_order = self._provider_order()
            if provider_order and provider_order[0] == "groq" and self._groq_client is not None:
                completion = self._groq_client.chat.completions.create(
                    model=model or self.model_for(task, provider="groq"),
                    messages=messages,
                    temperature=temperature,
                    max_completion_tokens=max_completion_tokens,
                    top_p=1,
                    stream=True,
                )
                for chunk in completion:
                    delta = getattr(chunk.choices[0], "delta", None)
                    content = normalize_text(getattr(delta, "content", None))
                    if content:
                        yield content
                return

            completion = self.complete(
                task=task,
                messages=messages,
                temperature=temperature,
                max_completion_tokens=max_completion_tokens,
                model=model,
            )
            content = self._completion_content(completion)
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
