# Backend

This folder contains the Python FastAPI backend for Vidya AI.

## Stack

- FastAPI
- Uvicorn
- SQLAlchemy
- Pydantic
- WebSockets
- Groq vision OCR
- PyMuPDF for PDF scan extraction

## Run

```bash
npm run backend
```

The API listens on `http://127.0.0.1:4000`.

If the backend is already running, `npm run backend` will reuse that process instead of starting a second copy. If port `4000` is occupied by something else, set `BACKEND_PORT` to a free port before starting the app.

## Environment

- `GROQ_API_KEY` - optional Groq token loaded from the project root `.env` file.
- `HUGGINGFACE_API_KEY` - optional Hugging Face token for the shared LLM router.
- `HUGGINGFACE_BASE_URL` - defaults to `https://router.huggingface.co/v1`.
- `HUGGINGFACE_MODEL` - text model used for chat, quiz, translation, and doubt handling when Hugging Face is active.
- `HUGGINGFACE_VISION_MODEL` - vision model used for OCR-style uploads when Hugging Face is active.
- `LLM_PROVIDER` - set to `auto` to prefer Hugging Face when configured, or force `groq` / `huggingface`.

## Main Endpoints

- `GET /health`
- `GET /api/session`
- `POST /api/session/login`
- `POST /api/session/logout`
- `POST /api/session/screen`
- `POST /api/session/language`
- `POST /api/session/subject`
- `GET /api/bootstrap`
- `GET /api/onboarding`
- `GET /api/dashboard`
- `GET /api/subjects`
- `GET /api/explanation`
- `GET /api/explanation?analysisId=123`
- `POST /api/explanation/chat`
- `POST /api/homework/analyze`
- `POST /api/analyze`
- `GET /api/quiz`
- `POST /api/quiz/answer`
- `POST /api/quiz/next`
- `POST /api/quiz/reset`
- `GET /api/parent`
- `GET /api/parent/report`
- `GET /api/planner/today`
- `GET /api/analytics/summary`
- `GET /api/subscription`
- `POST /api/subscription/upgrade`
- `POST /api/subscription/cancel`
- `GET /api/llm/status`
- `WebSocket /ws/updates`

## Storage

- SQLite database: `backend/vidya_ai.db`
- Uploads: `backend/uploads/`

## Scan Flow

- Image uploads are sent through the shared LLM router for OCR and cleanup. When `HUGGINGFACE_API_KEY` is configured, Hugging Face is preferred first and Groq is used as a fallback.
- PDF uploads are first read with PyMuPDF and then, when needed, rendered as page images for vision analysis.
- The backend stores the cleaned question text, scan summary, and detailed explanation so the explanation page can show them immediately after upload.
- The explanation page can now open the exact analysis row for the latest scan, and the chat endpoint answers doubts using that same scan context.
