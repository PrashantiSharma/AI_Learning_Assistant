const DEFAULT_MODEL = "meta-llama/Meta-Llama-3-8B-Instruct";

function isConfiguredApiKey(apiKey?: string): apiKey is string {
  if (!apiKey) {
    return false;
  }

  const normalized = apiKey.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    normalized.includes("your_huggingface_api_key_here") ||
    normalized.includes("your_api_key_here") ||
    normalized.includes("replace_me")
  ) {
    return false;
  }

  return true;
}

function buildFallbackResponse(prompt: string) {
  return [
    "3-Day Revision Strategy (Fallback Mode)",
    "",
    `Goal: ${prompt}`,
    "",
    "1. Pick Weakest Topics",
    "- Prioritize low quiz accuracy + low completion + high difficulty topics first.",
    "",
    "2. Day-by-Day Plan",
    "Day 1: Fix fundamentals of weakest topic, then 20-30 mixed questions.",
    "Day 2: Second weakest topic with active recall and error-log revision.",
    "Day 3: Mixed timed practice from both topics + final recap.",
    "",
    "3. Daily Session Split (4 hours example)",
    "- 90 min concept revision",
    "- 90 min problem solving",
    "- 30 min active recall",
    "- 30 min mistake notebook + retry",
    "",
    "4. End-of-Day Check",
    "- Note top 3 recurring mistakes and one improvement target for tomorrow.",
  ].join("\n");
}

function formatAssistantText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function askAssistant(
  prompt: string,
  context: Record<string, unknown>
) {
  const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();
  const model = process.env.HUGGINGFACE_MODEL || DEFAULT_MODEL;

  if (!isConfiguredApiKey(apiKey)) {
    return buildFallbackResponse(prompt);
  }

  const systemPrompt = `You are an AI learning assistant for students.
Help with study planning, topic prioritization, time management, and exam preparation.
Use the provided student context. Be specific, structured, and concise.

Output requirements:
- Return plain text only. Do not use markdown symbols like **, ##, *, or backticks.
- Use short headings and line breaks.
- For study-plan requests, always include:
1) Weakest topics identified with a one-line reason each
2) Day 1, Day 2, Day 3 plan
3) Daily checklist
4) One progress metric to track`;

  try {
    const response = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Student context: ${JSON.stringify(context)}\n\nQuestion: ${prompt}`,
            },
          ],
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.warn(`Assistant provider request failed: ${text}`);
      return buildFallbackResponse(prompt);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    return typeof content === "string"
      ? formatAssistantText(content)
      : buildFallbackResponse(prompt);
  } catch (error) {
    console.warn("Assistant provider unreachable, using fallback response.", error);
    return buildFallbackResponse(prompt);
  }
}
