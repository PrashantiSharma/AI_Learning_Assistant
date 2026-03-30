import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { predictStudyPlan } from "@/lib/ml-client";

export async function POST(req: NextRequest) {
  try {
    const { studentId, subjectId } = await req.json();

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { topics: true, student: true },
    });

    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    const rows = subject.topics.map((topic) => ({
      student_id: studentId,
      subject: subject.name,
      topic_name: topic.name,
      topic_difficulty: topic.difficulty ?? 3,
      exam_date: subject.examDate?.toISOString() ?? new Date().toISOString(),
      current_date: new Date().toISOString(),
      study_time_minutes: 60,
      quiz_accuracy: topic.quizAccuracy ?? 50,
      practice_attempts: topic.practiceAttempts ?? 0,
      revision_count: topic.revisionCount ?? 0,
      last_studied_days_ago: topic.lastStudiedDays ?? 7,
      completion_ratio: topic.completionRatio ?? 0,
      previous_score: topic.previousScore ?? 50,
      syllabus_text: subject.syllabus ?? "",
      exam_pattern_text: subject.examPattern ?? "",
      material_text: `${topic.name} practice notes and examples`,
    }));

    const prediction = await predictStudyPlan(rows);

    await prisma.studyPlan.create({
      data: {
        studentId,
        title: `${subject.name} Personalized Study Plan`,
        planDate: new Date(),
        contentJson: prediction,
      },
    });

    return NextResponse.json(prediction);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to generate study plan" }, { status: 500 });
  }
}
