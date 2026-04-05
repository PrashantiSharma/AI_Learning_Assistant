import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const studentId = new URL(req.url).searchParams.get("studentId")?.trim();
  const subjects = await prisma.subject.findMany({
    where: studentId ? { studentId } : undefined,
    include: { topics: true, student: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(subjects);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    studentId?: string;
    syllabus?: string;
    examPattern?: string;
    examDate?: string;
  };

  const studentId = body.studentId?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  if (!studentId || !name) {
    return NextResponse.json(
      { error: "studentId and subject name are required" },
      { status: 400 }
    );
  }

  const existing = await prisma.subject.findFirst({
    where: {
      studentId,
      name: { equals: name, mode: "insensitive" },
    },
  });

  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  const subject = await prisma.subject.create({
    data: {
      studentId,
      name,
      syllabus: body.syllabus?.trim() || null,
      examPattern: body.examPattern?.trim() || null,
      examDate: body.examDate ? new Date(body.examDate) : null,
    },
  });
  return NextResponse.json(subject, { status: 201 });
}
