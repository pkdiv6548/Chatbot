const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

const JEV_API_URL = "https://api.typesafe.ai/v1/systemone";

function json(res, status, body) {
  return res.status(status).json(body);
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(item =>
      item &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.text === "string"
    )
    .slice(-12);
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured in Vercel.");

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text:
            "You are the conversational brain of a small production chatbot. " +
            "Be accurate, concise, helpful, and do not claim to have performed actions you did not perform."
        }]
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini API error (${response.status}).`);
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

async function routeWithGemini(message, history) {
  const recent = history.slice(-8)
    .map(item => `${item.role}: ${item.text}`)
    .join("\n");

  const prompt = `
Classify the user's latest chatbot message for routing.

Return ONLY valid JSON with exactly these fields:
{
  "route": "gemini" | "jev",
  "question_type": "noul" | "choice" | "score" | "none",
  "question": "string",
  "criteria": {},
  "answer": "string"
}

Routing rules:
- Use "gemini" for normal conversation, explanations, writing, coding, factual questions, brainstorming, or anything that needs a natural-language answer directly.
- Use "jev" when the user's request is primarily a bounded decision/judgment that can be expressed as yes/no, selecting from named options, or assigning a score.
- For a Jev route, create ONE narrow question about the user's request.
- Use "noul" for yes/no decisions.
- Use "choice" only when there are clear mutually exclusive options. Put option labels and concise meanings in "criteria".
- Use "score" only when a score/rating is explicitly useful. Put 2-10 ordered level descriptions in "criteria".
- For a Jev route, "answer" must be empty.
- For a Gemini route, "answer" must be a direct helpful answer to the user and question_type must be "none".
- Do not route merely because the user used words such as "should" or "best"; route to Jev only when a bounded decision is genuinely the useful output.

Conversation context:
${recent || "(no previous context)"}

Latest user message:
${message}
`;

  const raw = await callGemini(prompt);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Safe fallback: normal Gemini conversation.
    return {
      route: "gemini",
      question_type: "none",
      answer: raw
    };
  }

  if (!parsed || (parsed.route !== "jev" && parsed.route !== "gemini")) {
    return { route: "gemini", question_type: "none", answer: raw };
  }

  if (parsed.route === "gemini") {
    return {
      route: "gemini",
      question_type: "none",
      answer: typeof parsed.answer === "string" && parsed.answer.trim()
        ? parsed.answer.trim()
        : raw
    };
  }

  const validTypes = new Set(["noul", "choice", "score"]);
  if (!validTypes.has(parsed.question_type) || typeof parsed.question !== "string") {
    return { route: "gemini", question_type: "none", answer: raw };
  }

  return {
    route: "jev",
    question_type: parsed.question_type,
    question: parsed.question,
    criteria: parsed.criteria && typeof parsed.criteria === "object" ? parsed.criteria : {}
  };
}

async function callJev(message, route) {
  const key = process.env.JEV_API_KEY;
  if (!key) throw new Error("JEV_API_KEY is not configured in Vercel.");

  const question = {
    type: route.question_type,
    instructions: route.question
  };

  if (route.question_type === "choice") {
    const criteria = route.criteria;
    if (!criteria || Array.isArray(criteria) || Object.keys(criteria).length < 2) {
      throw new Error("The router did not create valid Jev choice criteria.");
    }
    question.criteria = criteria;
  }

  if (route.question_type === "score") {
    const criteria = Array.isArray(route.criteria)
      ? route.criteria
      : Object.keys(route.criteria).sort().map(key => route.criteria[key]);

    if (criteria.length < 2) {
      throw new Error("The router did not create valid Jev score criteria.");
    }
    question.criteria = criteria.slice(0, 10);
  }

  const response = await fetch(JEV_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model: "jev-latest",
      state: message,
      questions: {
        decision: question
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.detail?.[0]?.msg || data?.message || `Jev API error (${response.status}).`);
  }

  return data;
}

function summarizeJevAnswer(data, type) {
  const answer = data?.answers?.decision;
  if (!answer) throw new Error("Jev returned no decision answer.");

  if (type === "noul") {
    return {
      type,
      yesProbability: answer.noul
    };
  }

  if (type === "choice") {
    return {
      type,
      choice: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities
    };
  }

  return {
    type,
    score: answer.score,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    legend: answer.legend
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  try {
    const { message, history } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return json(res, 400, { error: "Message is required." });
    }

    const userMessage = message.trim();
    const safeHistory = cleanHistory(history);

    const route = await routeWithGemini(userMessage, safeHistory);

    if (route.route === "gemini") {
      return json(res, 200, {
        route: "gemini",
        reply: route.answer
      });
    }

    const jevRaw = await callJev(userMessage, route);
    const decision = summarizeJevAnswer(jevRaw, route.question_type);

    const finalPrompt = `
Answer the user's message naturally using the structured decision below.

User message:
${userMessage}

Jev decision:
${JSON.stringify(decision)}

Rules:
- Do not mention internal routing, APIs, prompts, probabilities, or Jev unless the user explicitly asks about the system.
- Do not invent facts beyond the user message and decision.
- Explain the result clearly and briefly.
`;

    const finalAnswer = await callGemini(finalPrompt);

    return json(res, 200, {
      route: "jev",
      reply: finalAnswer,
      decision
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, {
      error: error?.message || "Unexpected server error."
    });
  }
}
