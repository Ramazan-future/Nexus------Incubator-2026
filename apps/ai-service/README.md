# Connect4: Nexus — AI Service

FastAPI microservice for analysis, coaching, and Ghost AI pipelines.

## Local dev

Create a venv and install deps:

```bash
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

Run:

```bash
.\.venv\Scripts\uvicorn app.main:app --reload --port 8001
```

Health check: `http://localhost:8001/health`

