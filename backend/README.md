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

- `GROQ_API_KEY` - loaded from the project root `.env` file for the LLM chat integration.

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

- Image uploads are sent to Groq vision for OCR and cleanup.
- PDF uploads are first read with PyMuPDF and then, when needed, rendered as page images for vision analysis.
- The backend stores the cleaned question text, scan summary, and detailed explanation so the explanation page can show them immediately after upload.
- The explanation page can now open the exact analysis row for the latest scan, and the chat endpoint answers doubts using that same scan context.
