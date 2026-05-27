from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(
    title="Connect4: Nexus AI Service",
    version="0.1.0",
    description="AI analysis and helper endpoints (Phase 1 stub).",
)


class AnalyzeRequest(BaseModel):
    game_id: str | None = Field(default=None)
    variant: str = Field(default="classic")
    state: dict = Field(default_factory=dict)


class AnalyzeResponse(BaseModel):
    ok: bool = True
    summary: str
    recommended_moves: list[dict] = Field(default_factory=list)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    # Phase 1 stub: server will call this later for heatmaps/blunders.
    return AnalyzeResponse(
        summary=f"Analysis stub for variant={req.variant}",
        recommended_moves=[],
    )

