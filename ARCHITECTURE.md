# Architecture

Full design document for the PDF quiz application.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Repository Structure](#repository-structure)
3. [Data Flow](#data-flow)
4. [AI Provider Abstraction](#ai-provider-abstraction)
5. [Text-to-Speech (TTS)](#text-to-speech-tts)
6. [Speech-to-Text (STT)](#speech-to-text-stt)
7. [Answer Evaluation](#answer-evaluation)
8. [API Reference](#api-reference)
9. [Frontend Components](#frontend-components)
10. [Key Dependencies](#key-dependencies)
11. [Known Risks](#known-risks)

---

## System Overview

```
PDF Upload
    │
    ▼
pdf-parse (extract raw text)
    │
    ▼
AI Provider — extractQAPairs()
    │  GPT-4o / Claude Opus
    │  Prompt → JSON array of { question, answer }
    ▼
Session stored server-side (shuffled)
    │
    ▼
Quiz Loop ──────────────────────────────────────────────────────────┐
    │                                                               │
    ▼                                                               │
TTS reads question aloud                                            │
(browser SpeechSynthesis or OpenAI tts-1)                          │
    │                                                               │
    ▼                                                               │
STT captures spoken answer                                          │
(browser SpeechRecognition or OpenAI Whisper)                       │
    │                                                               │
    ▼                                                               │
AI Provider — gradeAnswer()                                         │
    │  GPT-4o-mini / Claude Haiku                                   │
    │  Returns: { passed, missingConcepts[], feedback }             │
    ▼                                                               │
If passed → next question ──────────────────────────────────────────┘
If failed → show correct answer with diff highlighting
            (red = words present in correct answer, missing from user's)
```

---

## Repository Structure

```
random-questions/
├── package.json                  # npm workspaces root
├── .env                          # secrets (not committed)
├── CLAUDE.md
├── ARCHITECTURE.md
│
├── client/                       # React + Vite frontend
│   ├── package.json
│   ├── vite.config.ts            # proxies /api/* to server in dev
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/
│       │   └── quizApi.ts        # all fetch calls to backend
│       ├── components/
│       │   ├── UploadZone.tsx    # react-dropzone, PDF-only
│       │   ├── QuizCard.tsx      # question display, triggers TTS on mount
│       │   ├── MicButton.tsx     # pulsing animation, live interim transcript
│       │   ├── AnswerFeedback.tsx # pass/fail badge + word-diff highlighting
│       │   ├── ProgressBar.tsx
│       │   └── ResultsView.tsx
│       ├── hooks/
│       │   ├── useTTS.ts
│       │   ├── useSpeechRecognition.ts
│       │   └── useQuizSession.ts
│       ├── lib/
│       │   ├── tts/
│       │   │   └── detectTTSTier.ts
│       │   └── stt/
│       │       └── detectSTTTier.ts
│       ├── store/
│       │   └── quizStore.ts      # Zustand store
│       └── types/
│           └── index.ts
│
└── server/                       # Node.js + Express backend
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts              # server entry point
        ├── app.ts                # Express setup, route wiring
        ├── routes/
        │   ├── upload.ts         # POST /api/upload
        │   ├── quiz.ts           # GET  /api/quiz/session/:id
        │   ├── evaluate.ts       # POST /api/evaluate
        │   ├── results.ts        # GET  /api/quiz/results/:id
        │   ├── tts.ts            # POST /api/tts
        │   └── stt.ts            # POST /api/stt
        ├── services/
        │   ├── pdfService.ts     # pdf-parse wrapper
        │   ├── quizService.ts    # session management, quiz logic
        │   └── evaluationService.ts # fuzzy check + AI grading
        ├── middleware/
        │   ├── upload.ts         # multer config
        │   ├── rateLimit.ts
        │   └── errorHandler.ts
        ├── ai/                   # pluggable AI provider layer
        │   ├── types.ts
        │   ├── capabilities.ts
        │   ├── registry.ts
        │   ├── index.ts          # barrel + provider bootstrap
        │   └── providers/
        │       ├── openai/
        │       │   ├── extraction.ts
        │       │   ├── grading.ts
        │       │   ├── tts.ts
        │       │   ├── stt.ts
        │       │   ├── client.ts
        │       │   └── index.ts
        │       ├── anthropic/
        │       │   ├── extraction.ts
        │       │   ├── grading.ts
        │       │   ├── client.ts
        │       │   └── index.ts  # tts/stt = null
        │       └── mock/
        │           ├── all.ts
        │           └── index.ts
        └── types/
            └── index.ts
```

---

## Data Flow

### 1. PDF Upload and Extraction

```
Client                          Server                         OpenAI
  │                               │                              │
  │  POST /api/upload             │                              │
  │  multipart: { file: PDF }     │                              │
  │──────────────────────────────►│                              │
  │                               │  pdf-parse(buffer)           │
  │                               │  → rawText: string           │
  │                               │                              │
  │                               │  extractQAPairs(rawText)     │
  │                               │─────────────────────────────►│
  │                               │                              │  gpt-4o
  │                               │                              │  JSON mode
  │                               │  { pairs: [{ q, a }] }      │
  │                               │◄─────────────────────────────│
  │                               │                              │
  │                               │  Zod validation              │
  │                               │  shuffle question order      │
  │                               │  store in session Map        │
  │                               │                              │
  │  { sessionId, questionCount } │                              │
  │◄──────────────────────────────│                              │
```

### 2. Quiz Loop

```
Client                          Server                         OpenAI
  │                               │                              │
  │  GET /api/quiz/session/:id    │                              │
  │──────────────────────────────►│                              │
  │  { index, total, question }   │                              │
  │◄──────────────────────────────│                              │
  │                               │                              │
  │  [TTS reads question aloud]   │                              │
  │  [STT captures answer]        │                              │
  │                               │                              │
  │  POST /api/evaluate           │                              │
  │  { sessionId, index,          │                              │
  │    userAnswer: transcript }   │                              │
  │──────────────────────────────►│                              │
  │                               │  fuzzy check (Jaccard ≥0.85) │
  │                               │  → if pass: skip AI call     │
  │                               │                              │
  │                               │  gradeAnswer(q, correct, ua) │
  │                               │─────────────────────────────►│
  │                               │                              │  gpt-4o-mini
  │                               │  { passed, missing,          │
  │                               │    feedback }                │
  │                               │◄─────────────────────────────│
  │                               │                              │
  │  { passed, correctAnswer,     │                              │
  │    missingConcepts,           │                              │
  │    feedback, next }           │                              │
  │◄──────────────────────────────│                              │
```

---

## AI Provider Abstraction

### Design Pattern

**Strategy** (per capability) + **Self-Registering Registry** (per provider).

Each provider registers itself by calling `registerProvider()` from its own `index.ts`. The barrel `server/src/ai/index.ts` bootstraps all providers via side-effect imports — adding a provider only requires adding one import line there.

### Capability Interfaces (`server/src/ai/types.ts`)

```typescript
interface QAExtractionCapability {
  extractQAPairs(pdfText: string): Promise<QAPair[]>;
}

interface AnswerGradingCapability {
  gradeAnswer(question: string, correctAnswer: string, userAnswer: string): Promise<GradingResult>;
}

interface TTSCapability {
  synthesize(text: string): Promise<Buffer>;
}

interface STTCapability {
  transcribe(audio: Buffer, mimeType: string): Promise<string>;
}

interface AIProvider {
  readonly name: string;
  extraction: QAExtractionCapability;
  grading: AnswerGradingCapability;
  tts: TTSCapability | null;   // null = not supported
  stt: STTCapability | null;   // null = not supported
}
```

`null` is the explicit "not supported" signal. No `isSupported()` methods, no silent failures.

### Registry (`server/src/ai/registry.ts`)

```typescript
// Select provider via AI_PROVIDER env var (default: "openai")
getProvider(name?: string): AIProvider

// Merge two providers: primary for text, fallback fills audio gaps
getProviderWithFallback(primary?: string, fallback?: string): AIProvider
// e.g. getProviderWithFallback("anthropic", "openai")
//      → Anthropic for extraction/grading, OpenAI for TTS/STT
```

### Provider Capabilities

| Capability | OpenAI | Anthropic | Mock |
|---|---|---|---|
| Extraction | `gpt-4o` | `claude-opus-4-5` | static fixture |
| Grading | `gpt-4o-mini` | `claude-haiku-4-5` | always passes |
| TTS | `tts-1` (alloy) | **null** | dummy buffer |
| STT | `whisper-1` | **null** | static string |

### OpenAI Extraction Prompt Strategy

```
System:
  You are an expert educator. Given raw text from a PDF, extract all
  meaningful question-answer pairs. Return a JSON object with key "pairs"
  containing an array of { "question": string, "answer": string }.
  Do not fabricate information not present in the text.

User: <rawText>
```

Uses `response_format: { type: "json_object" }`. Response is validated with Zod. Retries once on validation failure. If PDF text exceeds ~60k chars, splits by page boundary and merges results.

### OpenAI Grading Prompt Strategy

```
System:
  You are a strict but fair examiner. Evaluate whether the student's spoken
  answer captures the essential meaning of the correct answer. Minor wording
  differences are acceptable; missing key concepts are not.
  Return ONLY JSON: { "passed": boolean, "missingConcepts": string[], "feedback": string }

User: { "question": "...", "correctAnswer": "...", "userAnswer": "..." }
```

### Adding a New Provider

1. Create `server/src/ai/providers/<name>/`
2. Implement `extraction.ts` and `grading.ts` (minimum); optionally `tts.ts` and `stt.ts`
3. Create `index.ts` that calls `registerProvider("<name>", () => ({ ... }))`
4. Add `import "./providers/<name>/index"` to `server/src/ai/index.ts`

No other files change.

---

## Text-to-Speech (TTS)

### Tier Detection (`client/src/lib/tts/detectTTSTier.ts`)

Returns `'browser'` when `window.speechSynthesis` exists **and** `getVoices()` returns at least one voice. Chrome loads voices asynchronously — waits for the `voiceschanged` event with a 500ms timeout. No user-agent sniffing.

### Browser Tier (`window.speechSynthesis`)

- Free, no server round-trip, instant
- Uses first `en-*` voice found in `getVoices()`
- `speak()` returns a `Promise` that resolves when audio ends (or is cancelled)
- **Chrome tab-backgrounding bug**: `speechSynthesis` silently stops when tab is hidden. Workaround: `setInterval` calls `pause()` + `resume()` every 5 seconds while speaking
- `stop()` calls `speechSynthesis.cancel()` → fires `onerror('interrupted')` → treated as clean cancellation, not an error

### Server Tier (`POST /api/tts` → OpenAI `tts-1`)

- Universal (works in all browsers), consistent voice quality
- Server pipes OpenAI's chunked MP3 stream directly to the HTTP response
- Client: `response.blob()` → `URL.createObjectURL()` → `new Audio(url).play()`
- Must be triggered within a user gesture (browser autoplay policy)
- Falls back to server tier automatically if browser tier errors at runtime

### Audio Pipeline (server tier)

```
text string
  → POST /api/tts { text }
  → openai.audio.speech.create({ model: 'tts-1', voice: 'alloy', response_format: 'mp3' })
  → Readable stream (chunked MP3, 128kbps, 24kHz)
  → Content-Type: audio/mpeg, Transfer-Encoding: chunked
  → response.blob() → objectURL → Audio.play()
```

---

## Speech-to-Text (STT)

### Tier Detection (`client/src/lib/stt/detectSTTTier.ts`)

Returns `'browser'` when `window.SpeechRecognition` (or `webkitSpeechRecognition`) exists. Firefox is explicitly routed to `'server'` — its `SpeechRecognition` implementation is non-functional without browser-controlled credentials (there is no programmatic way to distinguish a functional from a non-functional instance without attempting recognition and waiting for an error).

### Browser Tier (`window.SpeechRecognition`)

- Free, real-time interim transcripts while user speaks
- `continuous: false`, `interimResults: true`, `lang: 'en-US'`
- `interimTranscript` updates live; `finalTranscript` set in `onend`
- `no-speech` error → empty result (not an error state)
- `not-allowed` error → `error` state with "Microphone permission denied" message
- `aborted` error (from `stop()`) → clean cancellation → `idle` state

### Server Tier (`MediaRecorder` → `POST /api/stt` → Whisper)

- Universal, works in all browsers including Firefox
- No live interim transcripts (result available only after recording stops)
- `getUserMedia({ audio: true })` → `MediaRecorder` → collects audio chunks every 250ms
- Chrome/Edge: `audio/webm;codecs=opus` | Safari: `audio/mp4` — Whisper accepts both natively, no transcoding
- `multer.memoryStorage()` on server (typical answer < 500KB), forwarded to Whisper
- Mic stream released immediately when `recorder.stop()` fires

### STT State Machine

```
    ┌──────┐
    │ idle │◄────────────────────────────── reset() ─────────────────────┐
    └──┬───┘                                                              │
       │ startListening()                                                 │
       ▼                                                                  │
  ┌───────────┐                                                           │
  │ listening │── interim transcript updates (browser tier only)         │
  └──┬────────┘                                                           │
     │                                                                    │
     ├── stopListening() [browser] ──────────────────────────────►┐      │
     │   recognition ends naturally                               │      │
     │                                                            ▼      │
     │                                                        ┌────────┐ │
     ├── stopListening() [server] ──────────────────────────► │ result │─┘
     │                              ┌─────────────┐           └────────┘
     │                              │ processing  │               ▲
     └─────────────────────────────►│ (server     │───────────────┘
                                    │  tier only) │  /api/stt 200 OK
                                    └──────┬──────┘
                                           │ /api/stt error
                                           ▼
                                       ┌───────┐
                      not-allowed ────►│ error │◄──── network error
                                       └───────┘
```

### Audio Pipeline (server tier)

```
getUserMedia() → PCM (44.1/48kHz)
  → MediaRecorder (WebM/Opus or MP4/AAC)
  → ondataavailable every 250ms → Blob chunks
  → stop() → onstop
  → new Blob(chunks) → FormData ('recording.webm' or '.m4a')
  → POST /api/stt (multipart/form-data)
  → multer → req.file.buffer
  → openai.audio.transcriptions.create({ model: 'whisper-1' })
  → { text: "..." }
  → HTTP 200 { transcript: "..." }
```

---

## Answer Evaluation

Two-layer approach to minimize API calls:

### Layer 1 — Fast Fuzzy Check (free, no API call)

Computed server-side before any AI call:

```
Jaccard similarity = |words(userAnswer) ∩ words(correctAnswer)|
                   / |words(userAnswer) ∪ words(correctAnswer)|
```

Both strings are lowercased and stripped of punctuation first. If similarity ≥ 0.85, the answer is auto-passed without calling the AI.

### Layer 2 — AI Grading (only on failed or borderline answers)

Uses `gpt-4o-mini` (OpenAI) or `claude-haiku-4-5` (Anthropic). Returns:

```typescript
{
  passed: boolean,
  missingConcepts: string[],  // specific ideas from correct answer not covered
  feedback: string            // one or two sentences
}
```

### Client-side Diff Highlighting

When an answer fails, `AnswerFeedback.tsx` uses the `diff` npm package to compute a word-level diff between `correctAnswer` and `userAnswer`. Words from the correct answer that do not appear in the user's answer are highlighted in red. This is visual only and does not affect pass/fail logic.

---

## API Reference

### `POST /api/upload`

Upload a PDF for extraction.

**Request**: `multipart/form-data` with field `file` (PDF only, max 10MB)

**Response**:
```json
{ "sessionId": "abc123", "questionCount": 42 }
```

**Errors**: `400` no file | `415` not a PDF | `422` GPT extraction failed | `500`

---

### `GET /api/quiz/session/:sessionId`

Get the current question.

**Response**:
```json
{ "currentIndex": 0, "totalCount": 42, "question": "What is...?" }
```

**Errors**: `404` session not found | `410` session expired

---

### `POST /api/evaluate`

Submit a spoken answer for grading.

**Request**:
```json
{ "sessionId": "abc123", "questionIndex": 0, "userAnswer": "Paris" }
```

**Response**:
```json
{
  "passed": false,
  "correctAnswer": "Paris, the capital since...",
  "missingConcepts": ["capital since 987 AD", "population 2.1 million"],
  "feedback": "You named the city but missed the historical context.",
  "next": { "questionIndex": 1, "question": "What is...?" }
}
```

`next` is `null` when the quiz is complete.

---

### `GET /api/quiz/results/:sessionId`

Final score breakdown.

**Response**:
```json
{
  "totalQuestions": 42,
  "passed": 35,
  "failed": 7,
  "details": [{ "question": "...", "passed": true, "userAnswer": "...", "correctAnswer": "..." }]
}
```

---

### `DELETE /api/quiz/session/:sessionId`

Clean up session. Called via `navigator.sendBeacon` on tab close.

**Response**: `204 No Content`

---

### `POST /api/tts`

Synthesize text to speech.

**Request**: `application/json` `{ "text": "What is the capital of France?" }`

**Response**: `audio/mpeg` binary stream (MP3, 128kbps)

**Rate limit**: 30 requests/min/IP

---

### `POST /api/stt`

Transcribe audio to text.

**Request**: `multipart/form-data` with field `audio` (WebM, MP4, OGG, WAV, max 10MB)

**Response**: `{ "transcript": "Paris" }`

**Rate limit**: 60 requests/min/IP

---

### `GET /api/tts/available`

Check whether server-side TTS is configured (client uses this to decide whether to show a server-TTS option).

**Response**: `{ "available": true }`

---

## Frontend Components

```
App.tsx — simple state machine router (upload → quiz → results)
│
├── UploadZone.tsx
│     react-dropzone, PDF-only filter, 10MB size warning
│     Shows progress bar during POST /api/upload
│     On success: shows Q&A pair preview before starting quiz
│
├── QuizView.tsx — owns the quiz loop
│   ├── ProgressBar.tsx         currentIndex / totalCount
│   ├── QuizCard.tsx            question text display
│   │     useEffect: calls tts.speak() when question changes
│   ├── MicButton.tsx           pulsing animation while listening
│   │     shows live interimTranscript while user speaks
│   ├── AnswerFeedback.tsx      shown after evaluation
│   │     PassBadge / FailBadge
│   │     correct answer with red diff highlighting (missing words)
│   │     "Hear correct answer" button → tts.speak(correctAnswer)
│   └── NextButton.tsx          advances to next question
│
└── ResultsView.tsx
      Score summary, per-question pass/fail breakdown, restart button
```

### Custom Hooks

| Hook | Purpose |
|---|---|
| `useTTS` | Two-tier TTS; exposes `speak(text)`, `stop()`, `status`, `tier` |
| `useSpeechRecognition` | Two-tier STT; exposes `startListening()`, `stopListening()`, `state`, `interimTranscript`, `finalTranscript`, `tier` |
| `useQuizSession` | Manages question index, evaluation state, answer history, API calls |

---

## Key Dependencies

### Server

| Package | Purpose |
|---|---|
| `express` | HTTP server |
| `multer` | Multipart file upload handling |
| `pdf-parse` | Extract text from PDF (text-layer only) |
| `openai` | OpenAI SDK (GPT, TTS, Whisper) |
| `@anthropic-ai/sdk` | Anthropic SDK (Claude) |
| `zod` | Runtime validation of AI responses |
| `express-rate-limit` | Rate limiting |

### Client

| Package | Purpose |
|---|---|
| `react` + `vite` + `typescript` | Build tooling |
| `zustand` | Quiz session state |
| `react-dropzone` | PDF drag-and-drop upload |
| `diff` | Word-level diff for answer feedback highlighting |
| `tailwindcss` | Styling |

---

## Known Risks

### Scanned PDFs

`pdf-parse` extracts text from the PDF text layer. Scanned (image-only) PDFs produce < 100 characters of output. Detect this and return a `422` with a clear message: "This PDF appears to be image-based and cannot be processed. Please use a text-based PDF."

Adding OCR support would require `tesseract.js` (client-side) or Google Cloud Vision (server-side) — out of scope for MVP.

### GPT Extraction Failures

Poorly formatted PDFs (tables, multi-column layouts, footnotes inline with questions) can cause GPT to misparse Q&A boundaries. Mitigation: show the user a preview of all extracted pairs before starting the quiz, with delete buttons for bad entries.

### Browser Autoplay Policy

`new Audio(url).play()` in the server TTS tier will be rejected by the browser unless called from within a user gesture handler. Never call `tts.speak()` from a `useEffect` — always connect it to a click/keypress event.

### Session Storage

The MVP uses an in-memory `Map` on the server. This is wiped on server restart and does not work across multiple server instances. For production, use `connect-redis` with a 1-hour TTL. Session data is small (shuffled question array + answer history).

### Web Speech API in Firefox

Firefox ships `window.SpeechRecognition` but it requires browser-level credentials that are not available to web apps. `detectSTTTier()` routes Firefox to the server tier unconditionally rather than attempting recognition and waiting for an error event.

### Echo (TTS → STT Feedback Loop)

If `startListening()` is called before `speak()` finishes, the microphone will pick up the TTS audio and submit it as the user's answer. The quiz orchestration must enforce sequencing:

```typescript
await tts.speak(question.text);
await stt.startListening();
```

Never start STT while TTS status is `'speaking'`.

### Cost at Scale

For a single-user personal quiz tool, costs are negligible. If exposed publicly:
- GPT-4o extraction: called once per PDF upload (~$0.01–0.05 per upload)
- GPT-4o-mini grading: called per wrong answer (~$0.001 per evaluation)
- Whisper STT: ~$0.006/minute of audio
- OpenAI TTS: ~$0.015/1k characters

Add the existing rate limiting and a per-session question cap (≤ 200 questions) to prevent abuse.
