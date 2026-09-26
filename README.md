# Gemini + Jev AI Chatbot

A small Vercel-ready chatbot where the user never manually chooses a model.

## Routing

- Normal conversation → Gemini
- Bounded decision (yes/no, choice, score) → Jev
- Jev result → Gemini converts the structured decision into a natural-language reply

## Stack

- HTML
- CSS
- Vanilla JavaScript
- Vercel Serverless Function
- Gemini API
- TypeSafe Jev API
- No Python required
- No local Node.js installation required for deployment

## Files

```text
jev-gemini-chatbot/
├── index.html
├── style.css
├── script.js
├── api/
│   └── chat.js
├── .env.example
├── .gitignore
├── vercel.json
└── README.md
```

## Deploy

### 1. GitHub

Create a new repository and upload all files.

Do NOT upload real API keys.

### 2. Vercel

Import the GitHub repository into Vercel.

In Vercel → Project → Settings → Environment Variables, add:

```text
GEMINI_API_KEY = your Gemini API key
JEV_API_KEY = your TypeSafe API key
```

Apply them to the environment you deploy (Production; Preview too if you want preview deployments to work).

Then deploy/redeploy.

### 3. Test

Open the deployed URL and try:

Normal Gemini examples:
- "What is HTML?"
- "Explain CSS flexbox."
- "Write a short product description."

Jev decision examples:
- "Is this message asking for a refund?"
- "Which department should handle a duplicate payment: billing, shipping, or technical?"
- "Rate the urgency of this support message from low to high."

The user does not choose Gemini or Jev. The backend routes automatically.

## Security

API keys are read only on the Vercel server:

```js
process.env.GEMINI_API_KEY
process.env.JEV_API_KEY
```

Never put either key in `index.html`, `script.js`, or any client-side file.

## Important

This project uses Gemini as the conversational model and Jev as a structured decision model. Jev is not used as a general free-form text generator.

The Gemini routing step is intentionally conservative. If the request is not clearly a bounded decision, it stays with Gemini.

## Local development

No Python is required.

If you later want to run Vercel Functions locally, install Vercel CLI/Node.js. For the requested GitHub → Vercel deployment flow, you can deploy directly without installing Python locally.

## API model names

The backend currently targets:

```text
Gemini: gemini-3.8-flash
Jev: jev-latest
```

If either provider changes the currently available model alias, update the constants in `api/chat.js`.
