import { NextRequest, NextResponse } from "next/server";
import {
  UploadParseError,
  extractUploadedFileText,
} from "@/lib/upload-text-extractor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const result = await extractUploadedFileText(file);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
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
