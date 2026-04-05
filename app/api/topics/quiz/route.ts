import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthenticatedStudentFromRequest } from "@/lib/auth";
import {
  QuizGenerationError,
  generateTopicQuizWithHf,
  toPublicQuizQuestions,
} from "@/lib/topic-quiz";

export async function POST(req: NextRequest) {
  try {
    const student = await requireAuthenticatedStudentFromRequest(req);
    const payload = (await req.json()) as {
      topicId?: string;
      pyqText?: string;
    };

    const topicId = String(payload.topicId ?? "").trim();
    if (!topicId) {
      return NextResponse.json({ error: "topicId is required" }, { status: 400 });
    }

    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        subject: { studentId: student.id },
      },
      include: { subject: true },
    });

    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const questions = await generateTopicQuizWithHf({
      topicName: topic.name,
      examName: topic.subject.name,
      pyqText: String(payload.pyqText ?? topic.subject.examPattern ?? ""),
      syllabusText: String(topic.subject.syllabus ?? ""),
    });

    const attempt = await prisma.topicQuizAttempt.create({
      data: {
        studentId: student.id,
        topicId: topic.id,
        status: "generated",
        totalQuestions: questions.length,
        questionsJson: questions,
      },
      select: { id: true, totalQuestions: true },
    });

    return NextResponse.json({
      attemptId: attempt.id,
      topicId: topic.id,
      topicName: topic.name,
      examName: topic.subject.name,
      totalQuestions: attempt.totalQuestions,
      questions: toPublicQuizQuestions(questions),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof QuizGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to generate topic quiz" }, { status: 500 });
  }
}
