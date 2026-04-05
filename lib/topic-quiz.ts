const DEFAULT_QUIZ_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct";

export type PersistedQuizQuestion = {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctOptionIndex: number;
  explanation: string;
};

export type PublicQuizQuestion = {
  id: string;
  question: string;
  options: [string, string, string, string];
};

export class QuizGenerationError extends Error {
  status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}

function sanitizeText(input: unknown, maxLength: number) {
  return String(input ?? "")
    .replace(/\u0000/g, " ")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const stripped = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(stripped.slice(first, last + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeCorrectIndex(value: unknown) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    if (parsed >= 0 && parsed <= 3) return parsed;
    if (parsed >= 1 && parsed <= 4) return parsed - 1;
  }
  return -1;
}

function validateQuestions(payload: Record<string, unknown>) {
  const raw = Array.isArray(payload.questions) ? payload.questions : [];
  const normalized: PersistedQuizQuestion[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const q = entry as Record<string, unknown>;
    const question = sanitizeText(q.question, 400);
    const optionsRaw = Array.isArray(q.options) ? q.options : [];
    const options = optionsRaw
      .map((opt) => sanitizeText(opt, 160))
      .filter((opt) => opt.length > 0);
    const correctOptionIndex = normalizeCorrectIndex(
      q.correct_option_index ?? q.correctOptionIndex ?? q.answer_index
    );
    const explanation = sanitizeText(q.explanation ?? "", 250);

    if (!question) continue;
    if (options.length !== 4) continue;
    if (new Set(options.map((opt) => opt.toLowerCase())).size !== 4) continue;
    if (correctOptionIndex < 0 || correctOptionIndex > 3) continue;

    normalized.push({
      id: `q${index + 1}`,
      question,
      options: [options[0], options[1], options[2], options[3]],
      correctOptionIndex,
      explanation: explanation || "Review this concept and solve related PYQ problems.",
    });
  }

  if (normalized.length < 10) {
    throw new QuizGenerationError(
      "Failed to generate a complete 10-question quiz. Please retry.",
      503
    );
  }

  return normalized.slice(0, 10).map((item, index) => ({ ...item, id: `q${index + 1}` }));
}

function buildModelCandidates() {
  const primary =
    process.env.HUGGINGFACE_QUIZ_MODEL?.trim() ||
    process.env.HUGGINGFACE_MODEL?.trim() ||
    DEFAULT_QUIZ_MODEL;
  const fallback = (process.env.HUGGINGFACE_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  const candidates = [primary, DEFAULT_QUIZ_MODEL, "mistralai/Mistral-7B-Instruct-v0.3", ...fallback];
  return candidates.filter(
    (model, index, arr) => arr.findIndex((value) => value === model) === index
  );
}

function parseProviderError(text: string) {
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: { message?: string } };
    if (parsed.message) return parsed.message;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // no-op
  }
  return text;
}

export async function generateTopicQuizWithHf(input: {
  topicName: string;
  examName: string;
  pyqText: string;
  syllabusText: string;
}) {
  const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();
  if (!apiKey) {
    throw new QuizGenerationError("Hugging Face API key is not configured.", 500);
  }

  const topicName = sanitizeText(input.topicName, 120);
  const examName = sanitizeText(input.examName, 120) || "Exam";
  const pyqText = sanitizeText(input.pyqText, 6000);
  const syllabusText = sanitizeText(input.syllabusText, 4000);

  const prompt = [
    `Create exactly 10 multiple choice questions for exam preparation.`,
    `Exam: ${examName}`,
    `Topic: ${topicName}`,
    "Use PYQ style and difficulty trend from provided context.",
    "Return STRICT JSON only with this exact shape:",
    '{"questions":[{"question":"string","options":["A","B","C","D"],"correct_option_index":0,"explanation":"string"}]}',
    "Rules:",
    "- Exactly 10 questions",
    "- 4 options per question",
    "- One correct answer only",
    "- Questions must be specific to topic and exam style",
    "- No markdown, no extra text",
    `PYQ context:\n${pyqText || "No explicit PYQ text provided."}`,
    `Syllabus context:\n${syllabusText || "No explicit syllabus text provided."}`,
  ].join("\n");

  const modelCandidates = buildModelCandidates();
  let lastError = "Unknown provider error";

  for (const model of modelCandidates) {
    try {
      const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.25,
          max_tokens: 2200,
          messages: [
            {
              role: "system",
              content:
                "You generate exam-ready multiple choice quizzes. Return only valid JSON.",
            },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!response.ok) {
        const text = await response.text();
        lastError = parseProviderError(text);
        continue;
      }

      const payload = await response.json();
      const content = String(payload?.choices?.[0]?.message?.content ?? "");
      const parsed = extractJsonObject(content);
      if (!parsed) {
        lastError = "Could not parse JSON quiz payload from model response.";
        continue;
      }

      return validateQuestions(parsed);
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : "Hugging Face quiz request failed unexpectedly.";
    }
  }

  throw new QuizGenerationError(`Quiz generation failed: ${lastError}`, 503);
}

export function toPublicQuizQuestions(questions: PersistedQuizQuestion[]): PublicQuizQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    question: question.question,
    options: question.options,
  }));
}
