import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthenticatedStudentFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const student = await requireAuthenticatedStudentFromRequest(req);
    const topics = await prisma.topic.findMany({
      where: { subject: { studentId: student.id } },
      include: { subject: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(topics);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to load topics" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const student = await requireAuthenticatedStudentFromRequest(req);
    const body = (await req.json()) as {
      name?: string;
      subjectId?: string;
      difficulty?: number;
      completionRatio?: number;
      quizAccuracy?: number;
      revisionCount?: number;
      practiceAttempts?: number;
      previousScore?: number;
      lastStudiedDays?: number;
    };

    const subjectId = body.subjectId?.trim() ?? "";
    const name = body.name?.trim() ?? "";
    if (!subjectId || !name) {
      return NextResponse.json(
        { error: "subjectId and topic name are required" },
        { status: 400 }
      );
    }

    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, studentId: student.id },
      select: { id: true },
    });

    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    const existing = await prisma.topic.findFirst({
      where: {
        subjectId,
        name: { equals: name, mode: "insensitive" },
      },
    });

    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    const topic = await prisma.topic.create({
      data: {
        name,
        subjectId,
        difficulty:
          typeof body.difficulty === "number" && Number.isFinite(body.difficulty)
            ? body.difficulty
            : null,
        completionRatio:
          typeof body.completionRatio === "number" &&
          Number.isFinite(body.completionRatio)
            ? body.completionRatio
            : 0,
        quizAccuracy:
          typeof body.quizAccuracy === "number" &&
          Number.isFinite(body.quizAccuracy)
            ? body.quizAccuracy
            : 0,
        revisionCount:
          typeof body.revisionCount === "number" &&
          Number.isFinite(body.revisionCount)
            ? body.revisionCount
            : 0,
        practiceAttempts:
          typeof body.practiceAttempts === "number" &&
          Number.isFinite(body.practiceAttempts)
            ? body.practiceAttempts
            : 0,
        previousScore:
          typeof body.previousScore === "number" &&
          Number.isFinite(body.previousScore)
            ? body.previousScore
            : 0,
        lastStudiedDays:
          typeof body.lastStudiedDays === "number" &&
          Number.isFinite(body.lastStudiedDays)
            ? body.lastStudiedDays
            : 7,
      },
    });
    return NextResponse.json(topic, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create topic" }, { status: 500 });
  }
}
