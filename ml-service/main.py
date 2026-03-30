from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import pandas as pd

from model_pipeline import build_features, generate_daily_study_plan

app = FastAPI(title="Learning Assistant ML Service")


class TopicRow(BaseModel):
    student_id: str
    subject: str
    topic_name: str
    topic_difficulty: int
    exam_date: str
    current_date: str
    study_time_minutes: int
    quiz_accuracy: float
    practice_attempts: int
    revision_count: int
    last_studied_days_ago: int
    completion_ratio: float
    previous_score: float
    syllabus_text: str
    exam_pattern_text: str
    material_text: str


class PredictRequest(BaseModel):
    rows: List[TopicRow]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
def predict(req: PredictRequest):
    df = pd.DataFrame([row.model_dump() for row in req.rows])
    enriched = build_features(df)
    plan = generate_daily_study_plan(enriched, total_hours_available=4.0)

    return {
        "predictions": enriched.to_dict(orient="records"),
        "study_plan": plan.to_dict(orient="records"),
    }
