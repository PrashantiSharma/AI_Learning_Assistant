import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { askAssistant } from "@/lib/assistant";
import { AuthError, requireAuthenticatedStudentFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const authStudent = await requireAuthenticatedStudentFromRequest(req);
    let payload: unknown;

    try {
      payload = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body. Expected { message }." },
        { status: 400 }
      );
    }

    const body = payload as { message?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json(
        { error: "message is required." },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({
      where: { id: authStudent.id },
      include: {
        subjects: {
          include: { topics: true },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const reply = await askAssistant(message, {
      student: {
        id: student.id,
        name: student.name,
        dailyStudyHours: student.dailyStudyHours,
      },
      subjects: student.subjects,
    });

    await prisma.assistantMessage.createMany({
      data: [
        { studentId: authStudent.id, role: "user", content: message },
        { studentId: authStudent.id, role: "assistant", content: reply },
      ],
    });

    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Assistant failed" }, { status: 500 });
  }
}
