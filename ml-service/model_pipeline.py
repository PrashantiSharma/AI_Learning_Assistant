from __future__ import annotations

import numpy as np
import pandas as pd


STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "are", "was", "were",
    "exam", "topic", "unit", "section", "student", "students", "study", "learning"
}


def simple_tokenize(text: str) -> list[str]:
    if not isinstance(text, str):
        return []
    cleaned = "".join(ch.lower() if ch.isalnum() else " " for ch in text)
    return [t for t in cleaned.split() if len(t) >= 3 and t not in STOPWORDS]


def overlap_score(topic_name: str, text: str) -> float:
    topic_tokens = set(simple_tokenize(topic_name))
    text_tokens = set(simple_tokenize(text))
    if not topic_tokens or not text_tokens:
        return 0.0
    return len(topic_tokens.intersection(text_tokens)) / max(len(topic_tokens), 1)


def parse_days_until_exam(exam_date: pd.Series, current_date: pd.Series) -> pd.Series:
    exam_dt = pd.to_datetime(exam_date, errors="coerce")
    current_dt = pd.to_datetime(current_date, errors="coerce")
    delta = (exam_dt - current_dt).dt.days
    return delta.fillna(0).clip(lower=0)


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    numeric_cols = [
        "topic_difficulty",
        "study_time_minutes",
        "quiz_accuracy",
        "practice_attempts",
        "revision_count",
        "last_studied_days_ago",
        "completion_ratio",
        "previous_score",
    ]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df["days_until_exam"] = parse_days_until_exam(df["exam_date"], df["current_date"])
    df["topic_exam_importance"] = df.apply(
        lambda r: overlap_score(str(r["topic_name"]), str(r["exam_pattern_text"])), axis=1
    )
    df["topic_syllabus_coverage"] = df.apply(
        lambda r: overlap_score(str(r["topic_name"]), str(r["syllabus_text"])), axis=1
    )
    df["topic_material_overlap"] = df.apply(
        lambda r: overlap_score(str(r["topic_name"]), str(r["material_text"])), axis=1
    )

    df["urgency_score"] = 1 - np.clip(df["days_until_exam"] / 180.0, 0, 1)
    df["mastery_score"] = (
        0.45 * (df["quiz_accuracy"] / 100.0)
        + 0.25 * df["completion_ratio"]
        + 0.15 * np.clip(df["revision_count"] / 10.0, 0, 1)
        + 0.15 * (df["previous_score"] / 100.0)
    )

    df["rule_priority_score"] = (
        0.30 * df["urgency_score"]
        + 0.20 * df["topic_exam_importance"]
        + 0.15 * df["topic_syllabus_coverage"]
        + 0.15 * (1 - df["mastery_score"])
        + 0.10 * (df["topic_difficulty"] / 5.0)
        + 0.10 * np.clip(df["last_studied_days_ago"] / 30.0, 0, 1)
    )

    def to_priority(v: float) -> str:
        if v >= 0.66:
            return "high"
        if v >= 0.40:
            return "medium"
        return "low"

    df["predicted_priority_class"] = df["rule_priority_score"].apply(to_priority)
    df["priority_confidence"] = np.clip(0.55 + (df["rule_priority_score"] * 0.35), 0, 0.99)
    return df


def generate_daily_study_plan(df_pred: pd.DataFrame, total_hours_available: float = 4.0) -> pd.DataFrame:
    df = df_pred.copy()
    class_weight = {"high": 3.0, "medium": 2.0, "low": 1.0}
    df["rank_score"] = df["predicted_priority_class"].map(class_weight) * (0.7 + df["rule_priority_score"])
    df = df.sort_values(by=["rank_score", "priority_confidence"], ascending=False).reset_index(drop=True)

    total_score = df["rank_score"].sum()
    if total_score == 0:
        df["allocated_hours"] = round(total_hours_available / max(len(df), 1), 2)
    else:
        df["allocated_hours"] = ((df["rank_score"] / total_score) * total_hours_available).round(2)

    return df[[
        "student_id",
        "subject",
        "topic_name",
        "predicted_priority_class",
        "priority_confidence",
        "allocated_hours",
        "rule_priority_score",
        "quiz_accuracy",
        "completion_ratio",
        "days_until_exam",
    ]]
