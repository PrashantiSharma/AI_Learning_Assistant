import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { askAssistant } from "@/lib/assistant";

export async function POST(req: NextRequest) {
  try {
    let payload: unknown;

    try {
      payload = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body. Expected { studentId, message }." },
        { status: 400 }
      );
    }

    const body = payload as { studentId?: unknown; message?: unknown };
    const studentId =
      typeof body.studentId === "string" ? body.studentId.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!studentId || !message) {
      return NextResponse.json(
        { error: "studentId and message are required." },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
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
        { studentId, role: "user", content: message },
        { studentId, role: "assistant", content: reply },
      ],
    });

    return NextResponse.json({ reply });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Assistant failed" }, { status: 500 });
  }
}
