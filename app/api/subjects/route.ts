import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthenticatedStudentFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const student = await requireAuthenticatedStudentFromRequest(req);
    const subjects = await prisma.subject.findMany({
      where: { studentId: student.id },
      include: { topics: true, student: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(subjects);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to load subjects" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const student = await requireAuthenticatedStudentFromRequest(req);
    const body = (await req.json()) as {
      name?: string;
      syllabus?: string;
      examPattern?: string;
      examDate?: string;
    };

    const name = body.name?.trim() ?? "";
    if (!name) {
      return NextResponse.json(
        { error: "subject name is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.subject.findFirst({
      where: {
        studentId: student.id,
        name: { equals: name, mode: "insensitive" },
      },
    });

    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    const subject = await prisma.subject.create({
      data: {
        studentId: student.id,
        name,
        syllabus: body.syllabus?.trim() || null,
        examPattern: body.examPattern?.trim() || null,
        examDate: body.examDate ? new Date(body.examDate) : null,
      },
    });
    return NextResponse.json(subject, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create subject" }, { status: 500 });
  }
}
