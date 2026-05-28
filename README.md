# AI Homework Automation

Vidya AI is a homework assistant that combines a React frontend with a Python FastAPI backend.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Redux Toolkit
- Backend: Python, FastAPI, Uvicorn, SQLAlchemy, Pydantic, WebSockets

## Run

Start everything together:

```bash
npm run dev:full
```

Or start them separately:

```bash
npm run backend
npm run dev
```

## Notes

- The frontend proxies `/api` and `/ws` to the FastAPI server in development.
- The backend stores data in `backend/vidya_ai.db`.
- Homework analysis, quiz state, dashboard data, and parent reports are all served by the Python backend.
- Scanned PDFs and images are OCR-processed and then shown on the explanation page with detailed steps.
- The explanation page now opens the exact scan result from the latest upload, and the doubt bot answers follow-up questions using that same homework context.
- If port `4000` is already in use, set `BACKEND_PORT` before running `npm run backend` or `npm run dev:full`.
- Set `GROQ_API_KEY` in the root `.env` file for the LLM integration.





