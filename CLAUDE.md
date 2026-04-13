# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack quiz application that reads a PDF containing questions and answers, uses AI to extract Q&A pairs, then quizzes the user interactively using voice (TTS reads questions aloud, STT captures spoken answers, AI grades responses and highlights what was missing).

## Stack

- **Frontend**: React + TypeScript + Vite, Zustand, Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **AI**: Pluggable provider abstraction (OpenAI by default, Anthropic supported)
- **Monorepo**: npm workspaces (`client/` + `server/`)

## Commands

```bash
# Install all dependencies
npm install

# Run both client and server in development
npm run dev

# Run server only
npm run dev:server

# Run client only
npm run dev:client

# Build for production
npm run build

# Run tests
npm test

# Run a single test file
npm test -- path/to/test.ts
```

## Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...

# Optional — switches the AI provider (default: openai)
AI_PROVIDER=openai         # or: anthropic, mock
AI_FALLBACK_PROVIDER=openai  # fills TTS/STT gaps when primary lacks them

# Optional — override specific models per provider
OPENAI_EXTRACTION_MODEL=gpt-4o
OPENAI_GRADING_MODEL=gpt-4o-mini
ANTHROPIC_EXTRACTION_MODEL=claude-opus-4-5
ANTHROPIC_GRADING_MODEL=claude-haiku-4-5

ANTHROPIC_API_KEY=sk-ant-...  # required only when AI_PROVIDER=anthropic
```

## Architecture

See `ARCHITECTURE.md` for the full design. Key structural points:

### AI Provider Abstraction (`server/src/ai/`)

The AI layer uses a self-registering registry pattern. Each provider lives in `server/src/ai/providers/<name>/` and calls `registerProvider()` from its `index.ts`. The barrel `server/src/ai/index.ts` bootstraps all providers via side-effect imports.

**Adding a new provider**: create `providers/<name>/`, implement the capability interfaces from `types.ts`, add `import "./providers/<name>/index"` to `server/src/ai/index.ts`. No other files change.

**Capabilities** (`server/src/ai/types.ts`):
- `QAExtractionCapability` — `extractQAPairs(pdfText)`
- `AnswerGradingCapability` — `gradeAnswer(question, correctAnswer, userAnswer)`
- `TTSCapability` — `synthesize(text)` → `Buffer` (optional, can be `null`)
- `STTCapability` — `transcribe(audio, mimeType)` → `string` (optional, can be `null`)

Providers that lack TTS/STT set those fields to `null` explicitly. Use `getProviderWithFallback("anthropic", "openai")` to compose providers.

### TTS: Two-Tier System

1. **Browser tier** (`window.speechSynthesis`) — free, instant, OS-dependent quality
2. **Server tier** (`POST /api/tts` → OpenAI `tts-1`) — universal, consistent quality

`useTTS` hook in `client/src/hooks/useTTS.ts` detects tier via `detectTTSTier()` (checks voice availability, not user agent). Falls back to server tier if browser tier errors at runtime.

**Chrome bug**: `speechSynthesis` silently dies when tab is backgrounded. The hook works around this with a `setInterval` that calls `pause()`+`resume()` every 5 seconds while speaking.

### STT: Two-Tier System

1. **Browser tier** (`window.SpeechRecognition`) — free, real-time interim transcripts, Chrome/Edge/Safari only
2. **Server tier** (`MediaRecorder` → `POST /api/stt` → OpenAI Whisper) — universal, no live transcript

`useSpeechRecognition` hook in `client/src/hooks/useSpeechRecognition.ts`. Firefox is explicitly routed to the server tier (its `SpeechRecognition` is non-functional without browser-controlled credentials).

STT state machine: `idle → listening → processing → result → idle`

**Echo prevention**: quiz orchestration must `await tts.speak()` before calling `stt.startListening()`.

### Quiz Orchestration

```typescript
const askQuestion = async (question) => {
  await tts.speak(question.text);    // reads question aloud
  await stt.startListening();        // mic opens after TTS finishes
  submitAnswer(stt.finalTranscript); // evaluate spoken answer
};
```

### Answer Evaluation

Two-layer approach to reduce API calls:
1. **Fast fuzzy check** (client-side, free): Jaccard similarity ≥ 0.85 → auto-pass
2. **GPT grading** (server-side, `gpt-4o-mini`): returns `{ passed, missingConcepts[], feedback }`

Client uses the `diff` npm package to highlight missing words in the correct answer (red = word present in correct answer but missing from user's answer).

## API Endpoints

```
POST   /api/upload              → { sessionId, questionCount }
GET    /api/quiz/session/:id    → { currentIndex, totalCount, question }
POST   /api/evaluate            → { passed, correctAnswer, missingConcepts, feedback, next }
GET    /api/quiz/results/:id    → { totalQuestions, passed, failed, details[] }
DELETE /api/quiz/session/:id    → 204
POST   /api/tts                 → audio/mpeg stream
POST   /api/stt                 → { transcript }
GET    /api/tts/available       → { available: boolean }
```

## Key Risks

- **Scanned PDFs**: `pdf-parse` only works on text-layer PDFs. Detect failure if < 100 chars extracted and return a clear error.
- **GPT extraction errors**: Show users a preview of extracted Q&A pairs before starting the quiz so they can remove bad parses.
- **Autoplay policy**: `tts.speak()` from server tier must be triggered within a user gesture, not a `useEffect`.
- **Session storage**: In-memory `Map` for MVP. Use `connect-redis` with 1-hour TTL for production.
