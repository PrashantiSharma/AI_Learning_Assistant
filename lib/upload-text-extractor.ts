import { createRequire } from "node:module";
import {
  isLowQualityAcademicExtractionText,
  prepareWorkflowDocumentText,
} from "@/lib/study-plan-workflow";

const requireFromRoot = createRequire(import.meta.url);
let cachedPdfParse:
  | ((data: Buffer) => Promise<{ text?: string }>)
  | null = null;

export type UploadResult = {
  filename: string;
  fileKind: "pdf" | "text" | "doc" | "unknown";
  extractedText: string;
  extractedLength: number;
  lowQuality: boolean;
};

export class UploadParseError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function inferFileKind(file: File): UploadResult["fileKind"] {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".txt") || mime.startsWith("text/plain")) return "text";
  if (name.endsWith(".md") || mime.includes("markdown")) return "text";
  if (name.endsWith(".csv") || mime.includes("csv")) return "text";
  if (name.endsWith(".doc") || name.endsWith(".docx")) return "doc";
  return "unknown";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!cachedPdfParse) {
    const parsedModule = requireFromRoot("pdf-parse/lib/pdf-parse.js") as
      | ((data: Buffer) => Promise<{ text?: string }>)
      | { default?: (data: Buffer) => Promise<{ text?: string }> };
    cachedPdfParse =
      typeof parsedModule === "function" ? parsedModule : parsedModule.default ?? null;
  }

  if (typeof cachedPdfParse !== "function") {
    throw new UploadParseError("PDF parser module is not available on server", 500);
  }

  const result = await cachedPdfParse(buffer);
  return String(result.text ?? "");
}

export async function extractUploadedFileText(file: File): Promise<UploadResult> {
  const fileKind = inferFileKind(file);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let extractedText = "";

  if (fileKind === "pdf") {
    extractedText = await extractPdfText(buffer);
  } else if (fileKind === "text") {
    extractedText = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  } else if (fileKind === "doc") {
    throw new UploadParseError(
      "DOC/DOCX parsing is not enabled yet. Please paste extracted text for now.",
      400
    );
  } else {
    throw new UploadParseError(
      "Unsupported file format. Upload PDF/TXT/MD/CSV or paste extracted text.",
      400
    );
  }

  const prepared = prepareWorkflowDocumentText(extractedText);
  const lowQuality = isLowQualityAcademicExtractionText(prepared.text);

  if (!prepared.text || prepared.text.length < 40) {
    throw new UploadParseError(
      "Could not extract readable text from uploaded file. Please paste extracted text manually.",
      400
    );
  }

  return {
    filename: file.name,
    fileKind,
    extractedText: prepared.text,
    extractedLength: prepared.text.length,
    lowQuality,
  };
}
