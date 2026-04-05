import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const studentId = new URL(req.url).searchParams.get("studentId")?.trim();
  const topics = await prisma.topic.findMany({
    where: studentId ? { subject: { studentId } } : undefined,
    include: { subject: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(topics);
}

export async function POST(req: NextRequest) {
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
        typeof body.quizAccuracy === "number" && Number.isFinite(body.quizAccuracy)
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
        typeof body.previousScore === "number" && Number.isFinite(body.previousScore)
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
}
