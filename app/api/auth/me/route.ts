import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudentFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const student = await getAuthenticatedStudentFromRequest(req);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
    },
  });
}
