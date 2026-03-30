import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { askAssistant } from "@/lib/assistant";

export async function POST(req: NextRequest) {
  try {
    const { studentId, message } = await req.json();

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
