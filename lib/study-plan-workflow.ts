import crypto from "node:crypto";

const DEFAULT_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct";
const MAX_SUBJECTS = 5;
const MAX_TOPICS = 10;
const MAX_DOC_TEXT_LENGTH = 40000;
export const MAX_WORKFLOW_TOPICS = MAX_TOPICS;
const PDF_ARTIFACT_TERMS = new Set([
  "font",
  "fontdescriptor",
  "fontname",
  "fontfile",
  "fontfile2",
  "fontbbox",
  "basefont",
  "cidfonttype2",
  "cropbox",
  "mediabox",
  "resources",
  "procset",
  "contents",
  "xref",
  "trailer",
  "catalog",
  "flatedecode",
  "length1",
  "length2",
  "encoding",
  "tounicode",
  "type0",
  "obj",
  "endobj",
  "stream",
  "endstream",
  "parent",
  "kids",
  "pages",
  "count",
  "subtype",
  "bbox",
  "matrix",
]);
const ACADEMIC_HINT_TERMS = new Set([
  "unit",
  "chapter",
  "topic",
  "syllabus",
  "question",
  "problem",
  "derivation",
  "equation",
  "theorem",
  "concept",
  "reaction",
  "mechanics",
  "calculus",
  "algebra",
  "probability",
  "statistics",
  "physics",
  "chemistry",
  "biology",
  "history",
  "geography",
  "economics",
  "revision",
  "exam",
  "marks",
]);
const TOPIC_NOISE_TERMS = new Set([
  "gate",
  "exam",
  "paper",
  "question",
  "syllabus",
  "organizing",
  "institute",
  "instructions",
  "section",
  "part",
  "topic",
  "topics",
  "core",
  "special",
  "category",
  "categories",
  "corresponding",
]);
const COMMON_STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "this",
  "that",
  "these",
  "those",
  "given",
  "following",
  "respectively",
  "here",
  "there",
  "from",
  "into",
  "with",
  "without",
  "for",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "it",
  "its",
  "their",
  "his",
  "her",
  "our",
  "your",
  "you",
  "we",
  "they",
]);

export const WORKFLOW_DRAFT_TITLE_PREFIX = "Workflow Draft";

export type PriorKnowledge = "none" | "low" | "medium" | "high";

export type WorkflowTopic = {
  name: string;
  subject: string;
  importance: number;
  suggestedDifficulty: number;
};

export type WorkflowSubject = {
  name: string;
  importance: number;
  topics: WorkflowTopic[];
};

export class HfExtractionUnavailableError extends Error {
  status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}

type TopicCandidate = {
  name: string;
  key: string;
  syllabusHits: number;
  pyqHits: number;
  score: number;
};

type HfWindow = {
  syllabusText: string;
  questionPaperText: string;
  index: number;
  total: number;
};

export const PRIOR_KNOWLEDGE_COMPLETION_MAP: Record<PriorKnowledge, number> = {
  none: 0.05,
  low: 0.25,
  medium: 0.55,
  high: 0.8,
};

function isConfiguredApiKey(apiKey?: string): apiKey is string {
  if (!apiKey) return false;
  const normalized = apiKey.trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized.includes("your_huggingface_api_key_here") ||
    normalized.includes("your_api_key_here") ||
    normalized.includes("replace_me")
  ) {
    return false;
  }
  return true;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanLabel(value: unknown, fallback: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return raw.replace(/\s+/g, " ").replace(/[^\w\s&()\-:/]/g, "").trim();
}

function normalizeLabelKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPdfArtifactLabel(value: string) {
  const key = normalizeLabelKey(value);
  if (!key) return true;
  if (PDF_ARTIFACT_TERMS.has(key)) return true;
  if (
    key.startsWith("font") ||
    key.startsWith("cidfont") ||
    key.includes("descriptor") ||
    key.includes("cropbox") ||
    key.includes("mediabox") ||
    key.includes("flatedecode")
  ) {
    return true;
  }
  return false;
}

function isLikelyAcademicLabel(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 90) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (isPdfArtifactLabel(trimmed)) return false;
  return true;
}

function normalizeTopicLabel(value: string) {
  let cleaned = cleanLabel(value, "");
  cleaned = cleaned
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .replace(
      /^\s*(section|unit|chapter|module|part|paper)\s*[a-z0-9ivx]*\s*[:.\-\u2013\u2014]\s*/i,
      ""
    )
    .replace(/^\s*(core topics?|special topics?)\s*[:.\-\u2013\u2014]?\s*/i, "")
    .replace(/^\s*topics?\s*[:.\-\u2013\u2014]?\s*/i, "")
    .replace(/\s*[:\-\u2013\u2014]\s*$/, "")
    .trim();
  return cleaned;
}

function isLikelyNoiseTopicLabel(value: string) {
  const cleaned = normalizeTopicLabel(value);
  if (!cleaned) return true;
  if (cleaned.includes("|")) return true;
  const lower = cleaned.toLowerCase();
  if (
    /\borganizing institute\b/.test(lower) ||
    /\bquestion paper\b/.test(lower) ||
    /\bprevious year\b/.test(lower) ||
    /\bthe corresponding sections\b/.test(lower) ||
    /\binto two categories\b/.test(lower)
  ) {
    return true;
  }
  if (/\b(gate|jee|upsc|exam)\b/.test(lower) && /\b20\d{2}\b/.test(lower)) {
    return true;
  }
  if (/\b(is|are|will|shall|should|contains|include|includes)\b/.test(lower)) {
    return true;
  }
  const tokens = simpleTokenize(lower);
  if (tokens.length === 0) return true;
  if (tokens.length > 8) return true;
  const noiseHits = tokens.filter((token) => TOPIC_NOISE_TERMS.has(token)).length;
  if (noiseHits >= 2 && tokens.length >= 4) return true;
  return false;
}

function isLikelyTopicName(value: string) {
  const cleaned = normalizeTopicLabel(value);
  if (!cleaned) return false;
  if (!isLikelyAcademicLabel(cleaned)) return false;
  if (isPdfArtifactLabel(cleaned)) return false;
  if (isLikelyNoiseTopicLabel(cleaned)) return false;
  const tokens = simpleTokenize(cleaned);
  if (tokens.length === 0) return false;
  const stopwordHits = tokens.filter((token) => COMMON_STOPWORDS.has(token)).length;
  if (stopwordHits > 0 && stopwordHits / tokens.length >= 0.4) return false;
  if (tokens.length === 1) {
    const token = tokens[0];
    if (COMMON_STOPWORDS.has(token)) return false;
    if (token.length < 6) return false;
  }
  return true;
}

function simpleTokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function topicCoverageScore(topicName: string, text: string) {
  const tokens = [...new Set(simpleTokenize(topicName))];
  if (tokens.length === 0) return 0;
  const textLower = text.toLowerCase();
  let matches = 0;
  for (const token of tokens) {
    if (textLower.includes(token)) matches += 1;
  }
  return matches / tokens.length;
}

function countPhraseOccurrences(text: string, phrase: string) {
  const cleanedPhrase = normalizeTopicLabel(phrase);
  if (!cleanedPhrase) return 0;
  const lowerText = text.toLowerCase();
  const lowerPhrase = cleanedPhrase.toLowerCase();
  if (!lowerText || !lowerPhrase) return 0;

  const regex = new RegExp(`\\b${escapeRegex(lowerPhrase)}\\b`, "gi");
  let matches = 0;
  while (regex.exec(lowerText) !== null) {
    matches += 1;
    if (matches > 20) break;
  }

  if (matches > 0) return matches;
  const tokens = [...new Set(simpleTokenize(lowerPhrase))];
  if (tokens.length === 0) return 0;
  const coverage =
    tokens.filter((token) => lowerText.includes(token)).length / tokens.length;
  if (coverage >= 0.9) return 1;
  if (coverage >= 0.65) return 0.5;
  return 0;
}

function extractPotentialTopicSegments(text: string) {
  const segments: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const normalized = line.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const parts = normalized
      .split(/[;•·]/g)
      .flatMap((part) => part.split(/\s{2,}/g))
      .map((part) =>
        part
          .replace(/^\s*[\(\[]?[a-z0-9ivx]+[\)\].:-]\s*/i, "")
          .replace(/^\s*\d+[\)\].:-]\s*/i, "")
          .trim()
      )
      .filter(Boolean);
    segments.push(...parts);
  }
  return segments;
}

function buildTopicCandidatePool(
  syllabusText: string,
  questionPaperText: string,
  maxCandidates = 80
) {
  const candidateMap = new Map<string, TopicCandidate>();
  const pushCandidate = (raw: string) => {
    const normalized = normalizeTopicLabel(raw);
    if (!isLikelyTopicName(normalized)) return;
    const key = normalizeLabelKey(normalized);
    if (!key) return;

    const syllabusHits = Number(countPhraseOccurrences(syllabusText, normalized));
    const pyqHits = Number(countPhraseOccurrences(questionPaperText, normalized));
    const tokens = simpleTokenize(normalized);
    if (tokens.length === 1 && (syllabusHits <= 0 || pyqHits <= 0)) return;
    const score = clamp(
      syllabusHits * 0.65 + pyqHits * 0.35 + (syllabusHits > 0 && pyqHits > 0 ? 0.8 : 0),
      0,
      99
    );

    const existing = candidateMap.get(key);
    if (!existing || score > existing.score) {
      candidateMap.set(key, {
        name: normalized,
        key,
        syllabusHits,
        pyqHits,
        score,
      });
    }
  };

  for (const segment of extractPotentialTopicSegments(syllabusText)) {
    pushCandidate(segment);
  }
  for (const segment of extractPotentialTopicSegments(questionPaperText)) {
    pushCandidate(segment);
  }

  return [...candidateMap.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.length - b.name.length;
    })
    .slice(0, maxCandidates);
}

function canonicalizeTopicName(
  rawTopic: string,
  candidatePool: TopicCandidate[]
) {
  const normalized = normalizeTopicLabel(rawTopic);
  if (!isLikelyTopicName(normalized)) return null;
  if (candidatePool.length === 0) return normalized;

  const key = normalizeLabelKey(normalized);
  const exact = candidatePool.find((candidate) => candidate.key === key);
  if (exact) return exact.name;

  const topicTokens = new Set(simpleTokenize(normalized));
  if (topicTokens.size === 0) return null;

  let bestMatch: TopicCandidate | null = null;
  let bestScore = 0;
  for (const candidate of candidatePool) {
    const candidateTokens = new Set(simpleTokenize(candidate.name));
    if (candidateTokens.size === 0) continue;
    let overlap = 0;
    for (const token of topicTokens) {
      if (candidateTokens.has(token)) overlap += 1;
    }
    const denominator = Math.max(topicTokens.size, candidateTokens.size);
    const tokenScore = overlap / denominator;
    const containsBonus =
      candidate.name.toLowerCase().includes(normalized.toLowerCase()) ||
      normalized.toLowerCase().includes(candidate.name.toLowerCase())
        ? 0.15
        : 0;
    const score = tokenScore + containsBonus;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch && bestScore >= 0.72) return bestMatch.name;
  return null;
}

function lineQuality(line: string) {
  if (!line) return 0;
  const alphaChars = (line.match(/[A-Za-z]/g) ?? []).length;
  const numericChars = (line.match(/[0-9]/g) ?? []).length;
  const total = line.length;
  if (total === 0) return 0;
  const alphaRatio = alphaChars / total;
  const numericRatio = numericChars / total;
  if (alphaRatio < 0.35) return 0;

  let score = alphaRatio;
  if (line.length >= 20 && line.length <= 140) score += 0.2;
  if (/unit|chapter|topic|module|part|section|question|marks|weightage|syllabus/i.test(line)) {
    score += 0.25;
  }
  if (isPdfArtifactLabel(line)) score -= 0.6;
  if (numericRatio > 0.35) score -= 0.2;
  if (/obj|endobj|stream|xref|trailer|flatedecode|catalog/i.test(line)) score -= 0.5;
  return score;
}

function buildFocusedExcerpt(text: string, maxChars: number) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4 && line.length <= 180);

  const ranked = lines
    .map((line) => ({ line, score: lineQuality(line) }))
    .filter((item) => item.score > 0.35)
    .sort((a, b) => b.score - a.score);

  const unique: string[] = [];
  for (const item of ranked) {
    const key = item.line.toLowerCase();
    if (unique.find((line) => line.toLowerCase() === key)) continue;
    if (!isLikelyAcademicLabel(item.line)) continue;
    if (isPdfArtifactLabel(item.line)) continue;
    unique.push(item.line);
    if (unique.length >= 220) break;
  }

  const merged = unique.join("\n");
  return merged.slice(0, maxChars);
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return null;
  }
  const candidate = text.slice(first, last + 1);
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeExtractionPayload(
  payload: unknown,
  candidatePool: TopicCandidate[]
): WorkflowSubject[] {
  const root =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const subjectsRaw = Array.isArray(root.subjects) ? root.subjects : [];

  const normalizedSubjects = subjectsRaw
    .filter((subject) => subject && typeof subject === "object")
    .map((subject, subjectIndex) => {
      const asObject = subject as Record<string, unknown>;
      const subjectName = cleanLabel(
        asObject.name,
        `Subject ${subjectIndex + 1}`
      );
      if (!isLikelyAcademicLabel(subjectName) || isLikelyNoiseTopicLabel(subjectName)) {
        return {
          name: "",
          importance: 0,
          topics: [],
        } satisfies WorkflowSubject;
      }
      const subjectImportance = clamp(
        Number(asObject.importance ?? 0.5) || 0.5,
        0,
        1
      );
      const topicsRaw = Array.isArray(asObject.topics) ? asObject.topics : [];
      const topics = topicsRaw
        .filter((topic) => topic && typeof topic === "object")
        .map((topic, topicIndex) => {
          const topicObject = topic as Record<string, unknown>;
          const modelImportance = clamp(
            Number(topicObject.importance ?? 0.5) || 0.5,
            0,
            1
          );
          const syllabusWeight = clamp(
            Number(topicObject.syllabus_weight ?? topicObject.syllabus_importance ?? 0.5) || 0.5,
            0,
            1
          );
          const pyqWeight = clamp(
            Number(topicObject.pyq_weight ?? topicObject.pyq_frequency ?? 0.5) || 0.5,
            0,
            1
          );
          const weightedImportance = clamp(
            modelImportance * 0.3 + syllabusWeight * 0.4 + pyqWeight * 0.3,
            0,
            1
          );
          const topicName = canonicalizeTopicName(
            cleanLabel(topicObject.name, `Topic ${topicIndex + 1}`),
            candidatePool
          );
          if (!topicName || !isLikelyTopicName(topicName)) {
            return null;
          }

          return {
            name: topicName,
            subject: subjectName,
            importance: weightedImportance,
            suggestedDifficulty: clamp(
              Math.round(Number(topicObject.suggested_difficulty ?? 3) || 3),
              1,
              5
            ),
          } satisfies WorkflowTopic;
        })
        .filter((topic): topic is WorkflowTopic => Boolean(topic))
        .filter((topic, index, arr) => {
          const key = topic.name.toLowerCase();
          return arr.findIndex((entry) => entry.name.toLowerCase() === key) === index;
        });

      return {
        name: subjectName,
        importance: subjectImportance,
        topics,
      } satisfies WorkflowSubject;
    })
    .filter((subject) => subject.name && subject.topics.length > 0)
    .slice(0, MAX_SUBJECTS);

  const flattened = normalizedSubjects
    .flatMap((subject) =>
      subject.topics.map((topic) => ({
        ...topic,
        weightedImportance:
          topic.importance * 0.8 + subject.importance * 0.2,
      }))
    )
    .sort((a, b) => b.weightedImportance - a.weightedImportance)
    .slice(0, MAX_TOPICS);

  const allowedKeys = new Set(
    flattened.map(
      (topic) => `${topic.subject.toLowerCase()}::${topic.name.toLowerCase()}`
    )
  );

  return normalizedSubjects
    .map((subject) => ({
      ...subject,
      topics: subject.topics.filter((topic) =>
        allowedKeys.has(`${subject.name.toLowerCase()}::${topic.name.toLowerCase()}`)
      ),
    }))
    .filter((subject) => subject.topics.length > 0);
}

function rerankTopicsBySourceEvidence(
  subjects: WorkflowSubject[],
  syllabusText: string,
  questionPaperText: string,
  candidatePool: TopicCandidate[]
) {
  const candidateByKey = new Map(candidatePool.map((candidate) => [candidate.key, candidate]));
  const allTopics = subjects.flatMap((subject) =>
    subject.topics.map((topic) => ({ ...topic, subjectName: subject.name }))
  );

  const reranked = allTopics
    .map((topic) => {
      const syllabusCoverage = topicCoverageScore(topic.name, syllabusText);
      const pyqCoverage = topicCoverageScore(topic.name, questionPaperText);
      const candidate = candidateByKey.get(normalizeLabelKey(topic.name));
      const candidateSupport = clamp((candidate?.score ?? 0) / 3, 0, 1);
      const evidenceScore = clamp(
        syllabusCoverage * 0.55 + pyqCoverage * 0.45,
        0,
        1
      );
      return {
        ...topic,
        finalImportance: clamp(
          topic.importance * 0.5 + evidenceScore * 0.35 + candidateSupport * 0.15,
          0,
          1
        ),
      };
    })
    .sort((a, b) => b.finalImportance - a.finalImportance)
    .slice(0, MAX_TOPICS);

  const allowed = new Set(
    reranked.map(
      (topic) =>
        `${topic.subjectName.trim().toLowerCase()}::${topic.name.trim().toLowerCase()}`
    )
  );

  return subjects
    .map((subject) => ({
      ...subject,
      topics: subject.topics
        .filter((topic) =>
          allowed.has(
            `${subject.name.trim().toLowerCase()}::${topic.name
              .trim()
              .toLowerCase()}`
          )
        )
        .map((topic) => {
          const ranked = reranked.find(
            (entry) =>
              entry.subjectName.trim().toLowerCase() ===
                subject.name.trim().toLowerCase() &&
              entry.name.trim().toLowerCase() === topic.name.trim().toLowerCase()
          );
          return ranked
            ? { ...topic, importance: ranked.finalImportance }
            : topic;
        }),
    }))
    .filter((subject) => subject.topics.length > 0);
}

function fallbackExtractSubjectsAndTopics(
  syllabusText: string,
  questionPaperText: string,
  candidatePool: TopicCandidate[]
): WorkflowSubject[] {
  const selectedCandidates =
    candidatePool.length > 0
      ? candidatePool.slice(0, MAX_TOPICS).map((candidate) => candidate.name)
      : [];

  const topics = selectedCandidates.map((name, index) => ({
    name,
    subject: "Core Subjects",
    importance: clamp(0.9 - index * 0.07, 0.2, 0.9),
    suggestedDifficulty: clamp(Math.round(2 + (name.length % 3)), 1, 5),
  }));

  if (topics.length === 0) {
    topics.push(
      {
        name: "Fundamental Concepts",
        subject: "Core Subjects",
        importance: 0.8,
        suggestedDifficulty: 3,
      },
      {
        name: "Practice Problem Solving",
        subject: "Core Subjects",
        importance: 0.72,
        suggestedDifficulty: 3,
      }
    );
  }

  return [
    {
      name: "Core Subjects",
      importance: 0.8,
      topics,
    },
  ];
}

function buildModelInputText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.55));
  const focused = buildFocusedExcerpt(text, Math.floor(maxChars * 0.3));
  const tail = text.slice(Math.max(0, text.length - Math.floor(maxChars * 0.15)));
  return sanitizeTextForStorage(`${head}\n\n${focused}\n\n${tail}`, maxChars);
}

function splitTextIntoChunks(text: string, maxChars: number) {
  const normalized = sanitizeTextForStorage(text, MAX_DOC_TEXT_LENGTH * 2);
  if (!normalized) return [] as string[];
  if (normalized.length <= maxChars) return [normalized];

  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";

  const pushBuffer = () => {
    const chunk = buffer.trim();
    if (chunk) chunks.push(chunk);
    buffer = "";
  };

  for (const line of lines) {
    if (line.length > maxChars) {
      if (buffer) pushBuffer();
      for (let start = 0; start < line.length; start += maxChars) {
        chunks.push(line.slice(start, start + maxChars));
      }
      continue;
    }

    const next = buffer ? `${buffer}\n${line}` : line;
    if (next.length > maxChars) {
      pushBuffer();
      buffer = line;
    } else {
      buffer = next;
    }
  }
  if (buffer) pushBuffer();
  return chunks;
}

function capChunkCount(chunks: string[], maxChunks: number) {
  if (chunks.length <= maxChunks) return chunks;

  const merged: string[] = [];
  for (let i = 0; i < maxChunks; i += 1) {
    const start = Math.floor((i * chunks.length) / maxChunks);
    const end = Math.floor(((i + 1) * chunks.length) / maxChunks);
    merged.push(chunks.slice(start, end).join("\n\n"));
  }
  return merged.filter(Boolean);
}

function buildHfWindows(syllabusText: string, questionPaperText: string): HfWindow[] {
  const syllabusChunks = capChunkCount(splitTextIntoChunks(syllabusText, 10000), 3);
  const pyqChunks = capChunkCount(splitTextIntoChunks(questionPaperText, 8000), 3);
  const total = Math.max(syllabusChunks.length, pyqChunks.length, 1);

  const windows: HfWindow[] = [];
  for (let i = 0; i < total; i += 1) {
    windows.push({
      syllabusText: syllabusChunks[i] ?? "",
      questionPaperText: pyqChunks[i] ?? "",
      index: i + 1,
      total,
    });
  }
  return windows;
}

function buildModelCandidates(primaryModel: string) {
  const configuredFallbacks = (process.env.HUGGINGFACE_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const candidates = [
    primaryModel,
    "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "mistralai/Mistral-7B-Instruct-v0.3",
    ...configuredFallbacks,
  ];

  return candidates.filter(
    (model, index, arr) => arr.findIndex((value) => value === model) === index
  );
}

function parseProviderErrorMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: { message?: string } };
    if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message.trim();
    if (typeof parsed?.error?.message === "string" && parsed.error.message.trim()) {
      return parsed.error.message.trim();
    }
  } catch {
    // no-op
  }
  return body.trim();
}

function isInvalidRequestBody(body: string) {
  const normalized = body.toLowerCase();
  return (
    normalized.includes("invalid_request_error") ||
    normalized.includes("invalid request") ||
    normalized.includes("too many tokens") ||
    normalized.includes("context length") ||
    normalized.includes("max tokens")
  );
}

function mergeWorkflowSubjects(
  subjectCollections: WorkflowSubject[][],
  candidatePool: TopicCandidate[],
  syllabusText: string,
  questionPaperText: string
) {
  const topicMap = new Map<
    string,
    {
      name: string;
      importance: number;
      difficultySum: number;
      count: number;
      subjectCounts: Map<string, number>;
    }
  >();

  for (const subjects of subjectCollections) {
    for (const subject of subjects) {
      for (const topic of subject.topics) {
        const key = normalizeLabelKey(topic.name);
        if (!key) continue;
        const existing = topicMap.get(key);
        if (!existing) {
          topicMap.set(key, {
            name: topic.name,
            importance: topic.importance,
            difficultySum: topic.suggestedDifficulty,
            count: 1,
            subjectCounts: new Map([[subject.name, 1]]),
          });
          continue;
        }

        existing.importance = Math.max(existing.importance, topic.importance);
        existing.difficultySum += topic.suggestedDifficulty;
        existing.count += 1;
        existing.subjectCounts.set(
          subject.name,
          (existing.subjectCounts.get(subject.name) ?? 0) + 1
        );
      }
    }
  }

  const flattened = [...topicMap.values()]
    .map((entry) => {
      const subject =
        [...entry.subjectCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
        "Core Subjects";
      return {
        name: entry.name,
        subject,
        importance: clamp(entry.importance + entry.count * 0.04, 0, 1),
        suggestedDifficulty: clamp(
          Math.round(entry.difficultySum / Math.max(entry.count, 1)),
          1,
          5
        ),
      } satisfies WorkflowTopic;
    })
    .sort((a, b) => b.importance - a.importance)
    .slice(0, MAX_TOPICS);

  const subjectGroups = new Map<string, WorkflowTopic[]>();
  for (const topic of flattened) {
    if (!subjectGroups.has(topic.subject)) subjectGroups.set(topic.subject, []);
    subjectGroups.get(topic.subject)?.push(topic);
  }

  const mergedSubjects: WorkflowSubject[] = [...subjectGroups.entries()]
    .map(([name, topics]) => ({
      name,
      importance:
        topics.reduce((sum, topic) => sum + topic.importance, 0) / Math.max(topics.length, 1),
      topics,
    }))
    .slice(0, MAX_SUBJECTS);

  return rerankTopicsBySourceEvidence(
    mergedSubjects,
    syllabusText,
    questionPaperText,
    candidatePool
  );
}

function isTimeoutLikeError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("timeout") ||
    message.includes("und_err_connect_timeout") ||
    message.includes("fetch failed")
  ) {
    return true;
  }
  return false;
}

export function buildWorkflowDraftTitle(sessionId: string) {
  return `${WORKFLOW_DRAFT_TITLE_PREFIX}:${sessionId}`;
}

export function createWorkflowSessionId() {
  return crypto.randomUUID();
}

export function normalizePriorKnowledge(value: unknown): PriorKnowledge {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "none") return "none";
  if (normalized === "low") return "low";
  if (normalized === "high") return "high";
  return "medium";
}

export function isWorkflowDraftPlanTitle(title: string) {
  return title.startsWith(`${WORKFLOW_DRAFT_TITLE_PREFIX}:`);
}

function sanitizeTextForStorage(input: string, maxLength = MAX_DOC_TEXT_LENGTH) {
  const withoutNull = input.replace(/\u0000/g, " ");
  const cleaned = withoutNull
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return cleaned.slice(0, maxLength);
}

function isLikelyRawPdfBinary(text: string) {
  const head = text.slice(0, 200).toLowerCase();
  return head.includes("%pdf-") || head.includes("obj") || head.includes("endobj");
}

function extractPrintableTextFromPdfLikeContent(raw: string) {
  const candidateMatches =
    raw
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .match(/[A-Za-z][A-Za-z0-9 ,;:()\-_/&]{3,120}/g) ?? [];

  const blocked = new Set([
    "obj",
    "endobj",
    "stream",
    "endstream",
    "xref",
    "trailer",
    "catalog",
    "type",
    "length",
    "filter",
    "flatedecode",
    "root",
    "pages",
    "kids",
    "count",
    "mediabox",
  ]);

  const unique: string[] = [];
  for (const match of candidateMatches) {
    const normalized = match.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const singleToken = normalized.toLowerCase();
    if (blocked.has(singleToken)) continue;
    if (isPdfArtifactLabel(normalized)) continue;
    if (!isLikelyAcademicLabel(normalized)) continue;
    if (unique.find((item) => item.toLowerCase() === singleToken)) continue;
    unique.push(normalized);
    if (unique.length >= 300) break;
  }

  return sanitizeTextForStorage(unique.join("\n"));
}

export function prepareWorkflowDocumentText(input: string) {
  const raw = String(input ?? "");
  const rawSanitized = sanitizeTextForStorage(raw, MAX_DOC_TEXT_LENGTH * 2);
  const detectedPdfBinary = isLikelyRawPdfBinary(rawSanitized);

  if (detectedPdfBinary) {
    const extracted = extractPrintableTextFromPdfLikeContent(rawSanitized);
    return {
      text: extracted,
      source: "pdf_binary",
    } as const;
  }

  return {
    text: sanitizeTextForStorage(rawSanitized),
    source: "plain_text",
  } as const;
}

export function isLowQualityAcademicExtractionText(text: string) {
  const tokens = simpleTokenize(text);
  if (tokens.length < 35) return true;

  const artifactHits = tokens.filter((token) => isPdfArtifactLabel(token)).length;
  const academicHits = tokens.filter((token) => ACADEMIC_HINT_TERMS.has(token)).length;
  const artifactRatio = artifactHits / Math.max(tokens.length, 1);

  if (artifactRatio > 0.08) return true;
  if (academicHits < 3) return true;
  return false;
}

export async function extractSubjectsAndTopicsWithHf(input: {
  syllabusText: string;
  questionPaperText: string;
  examDate: string;
  examName?: string;
  hfSessionId: string;
}) {
  const syllabusText = sanitizeTextForStorage(input.syllabusText);
  const questionPaperText = sanitizeTextForStorage(input.questionPaperText);
  const candidatePool = buildTopicCandidatePool(syllabusText, questionPaperText, 90);
  const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();
  const model = process.env.HUGGINGFACE_MODEL?.trim() || DEFAULT_MODEL;
  const allowFallbackOnHfFailure =
    process.env.HF_ALLOW_HEURISTIC_FALLBACK?.trim() === "true";

  if (!isConfiguredApiKey(apiKey)) {
    const fallback = fallbackExtractSubjectsAndTopics(
      syllabusText,
      questionPaperText,
      candidatePool
    );
    return {
      subjects: rerankTopicsBySourceEvidence(
        fallback,
        syllabusText,
        questionPaperText,
        candidatePool
      ),
      provider: "fallback",
      hfSessionId: input.hfSessionId,
    };
  }

  const modelCandidates = buildModelCandidates(model);
  const windows = buildHfWindows(syllabusText, questionPaperText);
  const promptCandidateList = candidatePool
    .slice(0, 60)
    .map(
      (candidate) =>
        `- ${candidate.name} (syllabus_hits:${candidate.syllabusHits}, pyq_hits:${candidate.pyqHits})`
    )
    .join("\n");

  try {
    let lastNetworkError: unknown = null;
    let lastProviderError = "";

    for (const activeModel of modelCandidates) {
      const windowSubjectCollections: WorkflowSubject[][] = [];
      let skipModelDueToInvalidRequest = false;

      for (const window of windows) {
        const syllabusForModel = buildModelInputText(window.syllabusText, 8500);
        const pyqForModel = buildModelInputText(window.questionPaperText, 6500);
        const prompt = [
          "Extract high-weight exam topics from syllabus and previous year papers.",
          `Exam name: ${input.examName ?? "Unknown Exam"}`,
          `Exam date: ${input.examDate}`,
          `Window ${window.index} of ${window.total} (all windows together represent full uploaded text).`,
          `Return STRICT JSON with this shape only:`,
          '{"subjects":[{"name":"string","importance":0.0,"topics":[{"name":"string","importance":0.0,"syllabus_weight":0.0,"pyq_weight":0.0,"suggested_difficulty":1}]}]}',
          `Rules:`,
          `- Keep subjects at most ${MAX_SUBJECTS}`,
          `- Keep total topics in this window at most 8`,
          `- Topic names must be concrete topic names from the provided text`,
          `- Never output PDF metadata terms like FontDescriptor, FontFile2, CropBox, MediaBox`,
          `- Never output headings/instructions like: GATE 2026, Organizing Institute, Core Topics, Section labels`,
          `- Prioritize topics that appear both in syllabus and PYQ`,
          `- Keep each topic short (usually 1-6 words, max 8 words)`,
          `- suggested_difficulty must be integer 1 to 5`,
          `- syllabus_weight and pyq_weight must be numbers between 0 and 1`,
          `Candidate topic pool (choose from this list wherever possible):\n${promptCandidateList}`,
          `Syllabus text:\n${syllabusForModel}`,
          `Previous year question paper text:\n${pyqForModel}`,
        ].join("\n");

        let response: Response | null = null;
        let windowNetworkError: unknown = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            response = await fetch("https://router.huggingface.co/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: activeModel,
                temperature: 0.05,
                max_tokens: 1400,
                messages: [
                  {
                    role: "system",
                    content:
                      "You are an exam curriculum parser. Return only valid JSON with no markdown. Prefer candidate topics and avoid headings/noise.",
                  },
                  { role: "user", content: prompt },
                ],
              }),
              signal: AbortSignal.timeout(45000),
            });
            break;
          } catch (error) {
            windowNetworkError = error;
            if (attempt === 0) {
              await new Promise((resolve) => setTimeout(resolve, 800));
            }
          }
        }

        if (!response) {
          lastNetworkError = windowNetworkError;
          continue;
        }

        if (!response.ok) {
          const body = await response.text();
          lastProviderError = parseProviderErrorMessage(body);
          console.warn(
            `Workflow extraction failed with provider for model ${activeModel}: ${body}`
          );

          if (response.status === 400 && isInvalidRequestBody(body)) {
            skipModelDueToInvalidRequest = true;
            break;
          }
          continue;
        }

        const payload = await response.json();
        const content = String(payload?.choices?.[0]?.message?.content ?? "");
        const parsed = extractJsonObject(content);
        const normalized = normalizeExtractionPayload(parsed, candidatePool);
        if (normalized.length > 0) {
          windowSubjectCollections.push(normalized);
        }
      }

      if (windowSubjectCollections.length > 0) {
        const merged = mergeWorkflowSubjects(
          windowSubjectCollections,
          candidatePool,
          syllabusText,
          questionPaperText
        );
        if (merged.length > 0) {
          return {
            subjects: merged,
            provider: "huggingface",
            hfSessionId: input.hfSessionId,
          };
        }
      }

      if (!skipModelDueToInvalidRequest && lastProviderError) {
        // if provider returned non-invalid model error, don't keep burning model fallbacks
        break;
      }
    }

    if (allowFallbackOnHfFailure) {
      const fallback = fallbackExtractSubjectsAndTopics(
        syllabusText,
        questionPaperText,
        candidatePool
      );
      return {
        subjects: rerankTopicsBySourceEvidence(
          fallback,
          syllabusText,
          questionPaperText,
          candidatePool
        ),
        provider: "fallback",
        hfSessionId: input.hfSessionId,
      };
    }

    if (lastProviderError) {
      throw new HfExtractionUnavailableError(
        `Hugging Face extraction failed: ${lastProviderError}`,
        503
      );
    }

    throw new HfExtractionUnavailableError(
      isTimeoutLikeError(lastNetworkError)
        ? "Hugging Face is temporarily unreachable (network timeout). Please retry extraction in 30-60 seconds."
        : "Hugging Face extraction failed. Please retry in a moment.",
      503
    );
  } catch (error) {
    console.warn("Workflow extraction fallback triggered.", error);
    if (error instanceof HfExtractionUnavailableError) {
      throw error;
    }
    if (!allowFallbackOnHfFailure) {
      throw new HfExtractionUnavailableError(
        isTimeoutLikeError(error)
          ? "Hugging Face is temporarily unreachable (network timeout). Please retry extraction in 30-60 seconds."
          : "Hugging Face extraction failed. Please retry.",
        503
      );
    }
    const fallback = fallbackExtractSubjectsAndTopics(
      syllabusText,
      questionPaperText,
      candidatePool
    );
    return {
      subjects: rerankTopicsBySourceEvidence(
        fallback,
        syllabusText,
        questionPaperText,
        candidatePool
      ),
      provider: "fallback",
      hfSessionId: input.hfSessionId,
    };
  }
}


