// GCAI Source Chat — server for Glitch
// Holds your free Gemini API key as a Glitch "Secret" (.env) and answers
// questions using only what's in sources.txt.

const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
const SOURCES_PATH = path.join(__dirname, "sources.txt");

if (!GEMINI_API_KEY) {
  console.warn(
    "WARNING: GEMINI_API_KEY is not set. Add it under Tools -> .env in Glitch."
  );
}

function loadSources() {
  try {
    return fs.readFileSync(SOURCES_PATH, "utf8");
  } catch (e) {
    return "";
  }
}

app.post("/api/chat", async (req, res) => {
  const { question, history } = req.body;

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Missing question." });
  }

  const sources = loadSources().trim();
  if (!sources) {
    return res.status(400).json({ error: "sources.txt is empty or missing." });
  }

  const systemPrompt = `You answer questions using ONLY the source material provided below. Do not use outside knowledge. If the answer isn't in the sources, say clearly that the sources don't cover it, don't guess or fill gaps from general knowledge. Keep answers direct and concise, quoting short specific phrases from the source when useful, but mostly answering in your own words. Never use em dashes.

SOURCES:
"""
${sources}
"""`;

  const priorTurns = Array.isArray(history) ? history.slice(-20) : [];
  const contents = priorTurns
    .filter((t) => t && t.content)
    .map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: String(t.content) }],
    }));
  contents.push({ role: "user", parts: [{ text: question }] });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(
      GEMINI_API_KEY
    )}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 1000 },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      const msg =
        (data.error && data.error.message) ||
        "The model provider returned an error.";
      return res.status(502).json({ error: msg });
    }

    const parts =
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts) ||
      [];
    const answer = parts
      .map((p) => p.text || "")
      .join("")
      .trim();

    res.json({ answer: answer || "No response received." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error contacting the model." });
  }
});

app.listen(PORT, () => {
  console.log(`GCAI Source Chat running on port ${PORT}`);
});
