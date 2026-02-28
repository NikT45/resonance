"use client";

import { useState, useRef } from "react";

interface Segment {
  type: "narration" | "dialogue";
  text: string;
  speaker?: string;
}

interface VoiceInfo {
  name: string;
  description: string;
}

interface GenerateResponse {
  segments: Segment[];
  voiceMap: Record<string, VoiceInfo>;
  audioBase64: string;
  error?: string;
}

// Ordered speaker colors for dialogue characters (skipping narrator)
const SPEAKER_COLORS = [
  "text-rose-400 border-rose-800 bg-rose-950/40",
  "text-sky-400 border-sky-800 bg-sky-950/40",
  "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  "text-violet-400 border-violet-800 bg-violet-950/40",
  "text-orange-400 border-orange-800 bg-orange-950/40",
  "text-pink-400 border-pink-800 bg-pink-950/40",
];

const SAMPLE_TEXT = `The old man sat by the fire, his hands trembling slightly as he poured the tea.

"You shouldn't have come here," he said without looking up. "It isn't safe."

Margaret stepped inside, closing the door softly behind her. The room smelled of woodsmoke and old paper.

"I had no choice," she replied. "They know about the letters."

He finally raised his eyes to meet hers — pale, watery, but still sharp. "All of them?"

"Every last one."

He set down the teapot and stared into the fire for a long moment. "Then we have perhaps two days," he murmured, more to himself than to her. "Perhaps less."`;

export default function Home() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const prevAudioUrl = useRef<string | null>(null);

  async function handleGenerate() {
    if (!text.trim()) return;
    setLoading(true);
    setStatus("Parsing text with Gemini...");
    setResult(null);
    if (prevAudioUrl.current) {
      URL.revokeObjectURL(prevAudioUrl.current);
      prevAudioUrl.current = null;
    }
    setAudioUrl(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      setStatus("Generating audio with ElevenLabs...");
      const data: GenerateResponse = await res.json();

      if (!res.ok || data.error) {
        setStatus(`Error: ${data.error ?? "Unknown error"}`);
        setLoading(false);
        return;
      }

      // Decode base64 → Blob URL
      const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      prevAudioUrl.current = url;
      setAudioUrl(url);
      setResult(data);
      setStatus("");
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  // Build a stable speaker → color index map from the response voiceMap
  function getSpeakerColorMap(voiceMap: Record<string, VoiceInfo>): Record<string, string> {
    const colorMap: Record<string, string> = {};
    let idx = 0;
    for (const speaker of Object.keys(voiceMap)) {
      if (speaker === "narrator") continue;
      colorMap[speaker] = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
      idx++;
    }
    return colorMap;
  }

  const speakerColorMap = result ? getSpeakerColorMap(result.voiceMap) : {};

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-serif">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-amber-400 mb-2">
            Sound Reader
          </h1>
          <p className="text-zinc-500 text-sm tracking-widest uppercase">
            Immersive Book Audio Generator
          </p>
        </header>

        {/* Input */}
        <section className="mb-8">
          <label className="block text-xs font-sans font-semibold text-zinc-400 tracking-widest uppercase mb-3">
            Book Excerpt
          </label>
          <textarea
            className="w-full h-56 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 text-sm leading-relaxed resize-none focus:outline-none focus:border-amber-600 placeholder:text-zinc-600 font-sans"
            placeholder="Paste a passage of text with dialogue and narration..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
          />
        </section>

        {/* Generate Button */}
        <div className="flex items-center gap-4 mb-10">
          <button
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-sans font-semibold text-sm rounded-full transition-colors"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Processing…
              </>
            ) : (
              "Generate Audio"
            )}
          </button>
          {status && (
            <span className="text-xs font-sans text-zinc-400 italic">{status}</span>
          )}
        </div>

        {/* Audio Player */}
        {audioUrl && (
          <section className="mb-10">
            <label className="block text-xs font-sans font-semibold text-zinc-400 tracking-widest uppercase mb-3">
              Audio
            </label>
            <audio
              controls
              src={audioUrl}
              className="w-full rounded-lg"
            />
          </section>
        )}

        {/* Voice Map Legend */}
        {result && Object.keys(result.voiceMap).length > 0 && (
          <section className="mb-8">
            <label className="block text-xs font-sans font-semibold text-zinc-400 tracking-widest uppercase mb-3">
              Voice Cast
            </label>
            <div className="flex flex-col gap-2">
              {Object.entries(result.voiceMap).map(([speaker, voice]) => {
                const colorClass = speaker === "narrator"
                  ? "text-zinc-300 border-zinc-700 bg-zinc-800/60"
                  : speakerColorMap[speaker] ?? SPEAKER_COLORS[0];
                const textColorClass = colorClass.split(" ")[0];
                return (
                  <div
                    key={speaker}
                    className={`flex items-baseline gap-2 px-3 py-2 rounded-lg border text-xs font-sans ${colorClass}`}
                  >
                    <span className={`font-bold shrink-0 ${textColorClass}`}>{speaker}</span>
                    <span className="text-zinc-500">·</span>
                    <span className="font-medium text-zinc-300 shrink-0">{voice.name}</span>
                    <span className="text-zinc-500 shrink-0">—</span>
                    <span className="text-zinc-500 italic">{voice.description}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Segment List */}
        {result && result.segments.length > 0 && (
          <section>
            <label className="block text-xs font-sans font-semibold text-zinc-400 tracking-widest uppercase mb-3">
              Segments
            </label>
            <div className="space-y-2">
              {result.segments.map((seg, i) => {
                if (seg.type === "narration") {
                  return (
                    <div
                      key={i}
                      className="px-4 py-3 rounded-lg bg-zinc-800/50 border border-zinc-800 text-zinc-400 text-sm leading-relaxed italic font-serif"
                    >
                      {seg.text}
                    </div>
                  );
                }

                const speaker = seg.speaker ?? "unknown";
                const colorClass = speakerColorMap[speaker] ?? SPEAKER_COLORS[0];
                const [textColor, borderColor, bgColor] = colorClass.split(" ");

                return (
                  <div
                    key={i}
                    className={`px-4 py-3 rounded-lg border text-sm leading-relaxed font-serif ${borderColor} ${bgColor}`}
                  >
                    <span className={`block text-xs font-sans font-bold tracking-widest uppercase mb-1 ${textColor}`}>
                      {speaker}
                    </span>
                    <span className="text-zinc-200">{seg.text}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
