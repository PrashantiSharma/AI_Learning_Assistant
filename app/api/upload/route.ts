import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuthenticatedStudentFromRequest } from "@/lib/auth";
import {
  UploadParseError,
  extractUploadedFileText,
} from "@/lib/upload-text-extractor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedStudentFromRequest(req);
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const result = await extractUploadedFileText(file);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof UploadParseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Failed to process uploaded file: ${error.message}`
            : "Failed to process uploaded file",
      },
      { status: 500 }
    );
  }
}
