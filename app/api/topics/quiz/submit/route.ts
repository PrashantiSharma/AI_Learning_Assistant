import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthenticatedStudentFromRequest } from "@/lib/auth";
import { PersistedQuizQuestion } from "@/lib/topic-quiz";

export async function POST(req: NextRequest) {
  try {
    const student = await requireAuthenticatedStudentFromRequest(req);
    const payload = (await req.json()) as {
      attemptId?: string;
      answers?: number[];
    };

    const attemptId = String(payload.attemptId ?? "").trim();
    const answers = Array.isArray(payload.answers)
      ? payload.answers.map((value) => Number(value))
      : [];

    if (!attemptId) {
      return NextResponse.json({ error: "attemptId is required" }, { status: 400 });
    }

    const attempt = await prisma.topicQuizAttempt.findFirst({
      where: { id: attemptId, studentId: student.id },
      include: {
        topic: {
          include: {
            subject: true,
          },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json({ error: "Quiz attempt not found" }, { status: 404 });
    }

    const questions = Array.isArray(attempt.questionsJson)
      ? (attempt.questionsJson as unknown as PersistedQuizQuestion[])
      : [];

    if (questions.length === 0) {
      return NextResponse.json({ error: "Quiz attempt is invalid" }, { status: 400 });
    }

    if (answers.length !== questions.length) {
      return NextResponse.json(
        { error: `Exactly ${questions.length} answers are required` },
        { status: 400 }
      );
    }

    for (const answer of answers) {
      if (!Number.isFinite(answer) || answer < 0 || answer > 3) {
        return NextResponse.json(
          { error: "Each answer must be a valid option index (0-3)" },
          { status: 400 }
        );
      }
    }

    let score = 0;
    const review = questions.map((question, index) => {
      const selected = answers[index];
      const correct = Number(question.correctOptionIndex);
      const isCorrect = selected === correct;
      if (isCorrect) score += 1;

      return {
        id: question.id,
        question: question.question,
        selectedOptionIndex: selected,
        correctOptionIndex: correct,
        options: question.options,
        isCorrect,
        explanation: question.explanation,
      };
    });

    const accuracy = (score / questions.length) * 100;

    await prisma.$transaction(async (tx) => {
      await tx.topicQuizAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "submitted",
          score,
          accuracy,
          answersJson: answers,
        },
      });

      const topic = await tx.topic.findUnique({
        where: { id: attempt.topicId },
        select: {
          quizAccuracy: true,
          practiceAttempts: true,
          revisionCount: true,
        },
      });

      const previousAttempts = Number(topic?.practiceAttempts ?? 0);
      const previousAccuracy = Number(topic?.quizAccuracy ?? 0);
      const weightedAccuracy =
        previousAttempts > 0
          ? (previousAccuracy * previousAttempts + accuracy) / (previousAttempts + 1)
          : accuracy;

      await tx.topic.update({
        where: { id: attempt.topicId },
        data: {
          quizAccuracy: Math.round(weightedAccuracy),
          previousScore: Math.round(accuracy),
          practiceAttempts: previousAttempts + 1,
          revisionCount:
            Number(topic?.revisionCount ?? 0) + (accuracy < 60 ? 1 : 0),
        },
      });
    });

    return NextResponse.json({
      attemptId: attempt.id,
      topicId: attempt.topicId,
      topicName: attempt.topic.name,
      examName: attempt.topic.subject.name,
      score,
      total: questions.length,
      accuracy: Math.round(accuracy * 100) / 100,
      review,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to submit quiz answers" }, { status: 500 });
  }
}
