export type TopicPayload = {
  student_id: string;
  subject: string;
  topic_name: string;
  topic_difficulty: number;
  exam_date: string;
  current_date: string;
  study_time_minutes: number;
  quiz_accuracy: number;
  practice_attempts: number;
  revision_count: number;
  last_studied_days_ago: number;
  completion_ratio: number;
  previous_score: number;
  syllabus_text: string;
  exam_pattern_text: string;
  material_text: string;
};

export async function predictStudyPlan(rows: TopicPayload[]) {
  const res = await fetch(`${process.env.ML_SERVICE_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch ML predictions: ${text}`);
  }

  return res.json();
}
