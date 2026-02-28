"use client";

import { useState, useRef, useEffect } from "react";

interface ScriptScene { index: number; heading: string; action: string; }
interface ScriptDialogueLine { sceneIndex: number; lineIndex: number; character: string; parenthetical?: string; text: string; }
interface StoryboardFrame { sceneIndex: number; imageBase64: string; mimeType: string; }
interface SfxItem { sceneIndex: number; prompt: string; startTime: number; audioBase64: string; }
interface MusicItem { sceneIndex: number; prompt: string; startTime: number; audioBase64: string; }
interface DialogueTone { lineIndex: number; stability: number; style: number; emotion: string; }
interface VoiceInfo { name: string; description: string; }

interface GenerateResponse {
  scenes: ScriptScene[];
  dialogueLines: ScriptDialogueLine[];
  storyboardFrames: StoryboardFrame[];
  voiceMap: Record<string, VoiceInfo>;
  linesAudio: string[];
  sfxList: SfxItem[];
  musicList: MusicItem[];
  dialogueTones: DialogueTone[];
  sceneStartTimes: number[];
  error?: string;
}

const SPEAKER_COLORS = [
  "text-rose-400", "text-sky-400", "text-emerald-400",
  "text-violet-400", "text-orange-400", "text-pink-400",
];

const SAMPLE_TEXT = `INT. COFFEE SHOP - DAY

A cozy neighborhood cafe. Morning light streams through fogged windows. Espresso machines hiss. MAYA (30s, intense gaze) sits across from DANIEL (40s, rumpled coat).

MAYA
You said you'd have the files by Tuesday.

DANIEL
(shifting in his seat)
There were complications.

MAYA
There are always complications with you.

DANIEL
This time it's different. Someone got there first.

EXT. CITY STREET - CONTINUOUS

Maya strides out of the cafe, Daniel close behind. Traffic noise. Wet pavement reflecting neon signs.

MAYA
Who? Who got there first?

DANIEL
I don't know. But they left something behind.

MAYA
Show me.

INT. APARTMENT HALLWAY - NIGHT

Fluorescent lights flicker overhead. A long, bare corridor. Maya holds a sealed envelope, hand trembling slightly.

DANIEL
(quietly)
Open it.

MAYA
What is this?

DANIEL
Everything you've been looking for. And everything you'll wish you hadn't found.`;

// ── Time helpers ─────────────────────────────────────────────────────────────

function toSRT(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── WAV helpers ───────────────────────────────────────────────────────────────

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function audioBufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const dataSize = len * numCh * 2;
  const ab = new ArrayBuffer(44 + dataSize); const v = new DataView(ab);
  writeString(v, 0, "RIFF"); v.setUint32(4, 36 + dataSize, true); writeString(v, 8, "WAVE");
  writeString(v, 12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * numCh * 2, true); v.setUint16(32, numCh * 2, true); v.setUint16(34, 16, true);
  writeString(v, 36, "data"); v.setUint32(40, dataSize, true);
  let off = 44;
  for (let f = 0; f < len; f++)
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buf.getChannelData(ch)[f]));
      v.setInt16(off, s < 0 ? s * 32768 : s * 32767, true); off += 2;
    }
  return ab;
}

const GAP_DLG_TO_DLG = 0.12;
const GAP_BETWEEN_SCENES = 0.5;

async function decodeB64Audio(b64: string): Promise<AudioBuffer> {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
  await ctx.close();
  return buf;
}

async function mixAudio(
  linesAudio: string[],
  dialogueLines: ScriptDialogueLine[],
  sfxList: SfxItem[],
  musicList: MusicItem[],
  sceneStartTimes: number[]
): Promise<string> {
  const lineBuffers: AudioBuffer[] = [];
  for (const b64 of linesAudio) {
    try { lineBuffers.push(await decodeB64Audio(b64)); }
    catch { lineBuffers.push(new AudioContext().createBuffer(1, 1, 44100)); }
  }

  const startTimes: number[] = [];
  let cursor = 0;
  for (let i = 0; i < dialogueLines.length; i++) {
    if (i > 0) {
      cursor += dialogueLines[i - 1].sceneIndex !== dialogueLines[i].sceneIndex
        ? GAP_BETWEEN_SCENES : GAP_DLG_TO_DLG;
    }
    startTimes.push(cursor);
    cursor += lineBuffers[i]?.duration ?? 0;
  }

  const sfxDecoded: { buffer: AudioBuffer; startTime: number }[] = [];
  for (const sfx of sfxList) {
    try {
      const buf = await decodeB64Audio(sfx.audioBase64);
      sfxDecoded.push({ buffer: buf, startTime: sceneStartTimes[sfx.sceneIndex] ?? sfx.startTime });
    } catch { /* skip */ }
  }

  const musicDecoded: { buffer: AudioBuffer; startTime: number }[] = [];
  for (const music of musicList) {
    try {
      const buf = await decodeB64Audio(music.audioBase64);
      musicDecoded.push({ buffer: buf, startTime: sceneStartTimes[music.sceneIndex] ?? music.startTime });
    } catch { /* skip */ }
  }

  const sampleRate = lineBuffers[0]?.sampleRate ?? 44100;
  const numChannels = lineBuffers[0]?.numberOfChannels ?? 1;
  const totalDuration = Math.max(
    cursor,
    sfxDecoded.reduce((m, { buffer, startTime }) => Math.max(m, startTime + buffer.duration), 0),
    musicDecoded.reduce((m, { buffer, startTime }) => Math.max(m, startTime + buffer.duration), 0)
  );

  const offCtx = new OfflineAudioContext(numChannels, Math.max(1, Math.ceil(totalDuration * sampleRate)), sampleRate);

  for (let i = 0; i < lineBuffers.length; i++) {
    const src = offCtx.createBufferSource();
    src.buffer = lineBuffers[i];
    src.connect(offCtx.destination);
    src.start(startTimes[i]);
  }

  const TARGET_PEAK = 0.6;
  for (const { buffer, startTime } of sfxDecoded) {
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let s = 0; s < data.length; s++) { const abs = Math.abs(data[s]); if (abs > peak) peak = abs; }
    }
    const src = offCtx.createBufferSource(); src.buffer = buffer;
    const gain = offCtx.createGain();
    gain.gain.value = peak > 0 ? TARGET_PEAK / peak : TARGET_PEAK;
    src.connect(gain); gain.connect(offCtx.destination); src.start(startTime);
  }

  // Music tracks at low gain (0.18) so they sit under dialogue
  for (const { buffer, startTime } of musicDecoded) {
    const src = offCtx.createBufferSource(); src.buffer = buffer;
    const gain = offCtx.createGain();
    gain.gain.value = 0.18;
    src.connect(gain); gain.connect(offCtx.destination); src.start(startTime);
  }

  const rendered = await offCtx.startRendering();
  return URL.createObjectURL(new Blob([audioBufferToWav(rendered)], { type: "audio/wav" }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [currentScene, setCurrentScene] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  const prevAudioUrl = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isDragging = useRef(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // ── Audio event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !result?.sceneStartTimes?.length) return;

    const handleTimeUpdate = () => {
      const t = audio.currentTime;
      setCurrentTime(t);
      const times = result.sceneStartTimes;
      let scene = 0;
      for (let i = 0; i < times.length; i++) { if (t >= times[i]) scene = i; }
      setCurrentScene(prev => {
        if (prev !== scene) {
          cardRefs.current[scene]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
          return scene;
        }
        return prev;
      });
    };

    const handleLoadedMetadata = () => setTotalDuration(audio.duration || 0);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    // If already loaded (e.g. re-render), grab duration immediately
    if (audio.readyState >= 1) setTotalDuration(audio.duration || 0);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [audioUrl, result]);

  // ── Space bar play/pause ───────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      e.preventDefault();
      const audio = audioRef.current;
      if (!audio) return;
      audio.paused ? audio.play() : audio.pause();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Generate ───────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!text.trim()) return;
    setLoading(true);
    setStatus("Parsing script…");
    setResult(null);
    setCurrentScene(0);
    setCurrentTime(0);
    setTotalDuration(0);
    if (prevAudioUrl.current) { URL.revokeObjectURL(prevAudioUrl.current); prevAudioUrl.current = null; }
    setAudioUrl(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      setStatus("Mixing audio…");
      const data: GenerateResponse = await res.json();

      if (!res.ok || data.error) {
        setStatus(`Error: ${data.error ?? "Unknown error"}`);
        setLoading(false);
        return;
      }

      const url = await mixAudio(data.linesAudio, data.dialogueLines, data.sfxList ?? [], data.musicList ?? [], data.sceneStartTimes ?? []);
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

  // ── Helpers ────────────────────────────────────────────────────────────────
  function sceneEndTime(i: number): number {
    const times = result?.sceneStartTimes ?? [];
    if (i + 1 < times.length) return times[i + 1];
    return totalDuration || times[times.length - 1] + 5;
  }

  function scrubTimeline(clientX: number, rect: DOMRect) {
    if (!audioRef.current || totalDuration <= 0) return;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audioRef.current.currentTime = frac * totalDuration;
  }

  function handleTimelineMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    isDragging.current = true;
    scrubTimeline(e.clientX, e.currentTarget.getBoundingClientRect());
  }

  function handleTimelineMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    scrubTimeline(e.clientX, e.currentTarget.getBoundingClientRect());
  }

  function handleTimelineMouseUp() {
    isDragging.current = false;
  }

  function seekToScene(i: number) {
    if (!audioRef.current || !result?.sceneStartTimes) return;
    audioRef.current.currentTime = result.sceneStartTimes[i] ?? 0;
  }

  function getSpeakerColorMap(voiceMap: Record<string, VoiceInfo>) {
    const map: Record<string, string> = {};
    let idx = 0;
    for (const k of Object.keys(voiceMap)) {
      if (k === "narrator") continue;
      map[k] = SPEAKER_COLORS[idx++ % SPEAKER_COLORS.length];
    }
    return map;
  }

  const speakerColorMap = result ? getSpeakerColorMap(result.voiceMap) : {};
  const frameByScene: Record<number, StoryboardFrame> = result
    ? Object.fromEntries(result.storyboardFrames.map(f => [f.sceneIndex, f]))
    : {};
  const linesByScene: Record<number, ScriptDialogueLine[]> = result
    ? result.scenes.reduce((acc, s) => {
        acc[s.index] = result.dialogueLines.filter(l => l.sceneIndex === s.index);
        return acc;
      }, {} as Record<number, ScriptDialogueLine[]>)
    : {};
  const toneMap: Record<number, DialogueTone> = result
    ? Object.fromEntries(result.dialogueTones.map(t => [t.lineIndex, t]))
    : {};

  const currentFrame = result ? frameByScene[currentScene] : undefined;
  const currentSceneData = result?.scenes[currentScene];
  const currentSceneMusic = result?.musicList?.find(m => m.sceneIndex === currentScene);
  const sceneStartTimes = result?.sceneStartTimes ?? [];
  const playheadPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col">

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header className="px-6 py-3 border-b border-zinc-900 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-amber-400 tracking-tight">Storyboard</h1>
          <p className="text-zinc-600 text-[10px] tracking-widest uppercase">Script to Cinematic Audio</p>
        </div>
        {loading && <span className="text-xs text-zinc-400 italic">{status}</span>}
      </header>

      {/* ── HERO FRAME ──────────────────────────────────────────────────────── */}
      {result && (
        <section className="w-full bg-black shrink-0 flex justify-center">
          <div className="relative" style={{ lineHeight: 0 }}>
            {currentFrame ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={currentScene}
                src={`data:${currentFrame.mimeType};base64,${currentFrame.imageBase64}`}
                alt={currentSceneData?.heading ?? ""}
                className="block max-h-[62vh] w-auto max-w-full"
                style={{ animation: "sceneFadeIn 0.5s ease-out" }}
              />
            ) : (
              <div className="flex items-center justify-center bg-zinc-900" style={{ width: "min(80vw, 110vh * 16 / 9)", height: "min(62vh, 80vw * 9 / 16)" }}>
                <span className="text-zinc-700 font-mono text-sm">No image</span>
              </div>
            )}

            {/* Scene heading — top-left */}
            {currentSceneData?.heading && (
              <div className="absolute top-4 left-4 font-mono text-xs text-white/80 bg-black/70 px-3 py-1.5 rounded backdrop-blur-sm tracking-widest uppercase">
                {currentSceneData.heading}
              </div>
            )}

            {/* Ambiance music indicator — top-right */}
            {currentSceneMusic && (
              <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2.5 py-1.5 rounded">
                <span className="text-violet-400 text-[11px]">♪</span>
                <span className="font-mono text-[10px] text-violet-300/80 tracking-wide max-w-[160px] truncate">{currentSceneMusic.prompt}</span>
              </div>
            )}

            {/* SRT stamp — bottom-left, cinema subtitle style */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-center">
              <div className="font-mono text-xs text-white/40 tracking-widest mb-0.5">
                SRT {currentScene + 1}
              </div>
              <div className="font-mono text-sm text-white bg-black/80 px-4 py-1.5 rounded-sm backdrop-blur-sm tracking-wider leading-none">
                {toSRT(sceneStartTimes[currentScene] ?? 0)} → {toSRT(sceneEndTime(currentScene))}
              </div>
            </div>

            {/* Active dialogue lines — bottom strip */}
            {(() => {
              const lines = linesByScene[currentScene] ?? [];
              if (!lines.length) return null;
              return (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-6 py-4 pt-10">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {lines.slice(0, 3).map(line => {
                      const color = speakerColorMap[line.character] ?? SPEAKER_COLORS[0];
                      return (
                        <div key={line.lineIndex} className="text-xs leading-snug">
                          <span className={`font-bold uppercase tracking-widest ${color}`}>{line.character} </span>
                          <span className="text-zinc-300 italic">&ldquo;{line.text.slice(0, 60)}{line.text.length > 60 ? "…" : ""}&rdquo;</span>
                        </div>
                      );
                    })}
                    {lines.length > 3 && <span className="text-zinc-500 text-xs">+{lines.length - 3} more</span>}
                  </div>
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* ── TIMELINE + AUDIO ─────────────────────────────────────────────────── */}
      {result && audioUrl && (
        <section className="px-6 py-4 space-y-3 shrink-0 border-b border-zinc-900">

          {/* Scene timeline scrubber */}
          <div
            ref={timelineRef}
            className="relative h-16 rounded-xl overflow-hidden cursor-ew-resize select-none bg-zinc-900 group"
            onMouseDown={handleTimelineMouseDown}
            onMouseMove={handleTimelineMouseMove}
            onMouseUp={handleTimelineMouseUp}
            onMouseLeave={handleTimelineMouseUp}
          >
            {result.scenes.map((scene, i) => {
              const start = sceneStartTimes[i] ?? 0;
              const end = sceneEndTime(i);
              const leftPct  = totalDuration > 0 ? (start / totalDuration) * 100 : (i / result.scenes.length) * 100;
              const widthPct = totalDuration > 0
                ? ((end - start) / totalDuration) * 100
                : (100 / result.scenes.length);
              const frame = frameByScene[scene.index];
              const isActive = i === currentScene;

              return (
                <div
                  key={i}
                  ref={el => { cardRefs.current[i] = el; }}
                  className="absolute top-0 h-full border-r border-zinc-800/60 overflow-hidden"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  onClick={e => { e.stopPropagation(); seekToScene(i); }}
                >
                  {/* Thumbnail */}
                  {frame && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:${frame.mimeType};base64,${frame.imageBase64}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                  {/* Overlay */}
                  <div className={`absolute inset-0 transition-colors duration-200 ${
                    isActive ? "bg-amber-500/20" : "bg-zinc-950/55 group-hover:bg-zinc-950/40"
                  }`} />
                  {/* Active ring */}
                  {isActive && <div className="absolute inset-0 ring-2 ring-inset ring-amber-500 rounded-none" />}
                  {/* SRT stamp on thumbnail */}
                  <div className="absolute bottom-1 left-1.5 font-mono text-[8px] text-white/60 leading-tight">
                    {formatTime(start)}
                  </div>
                  <div className="absolute top-1 left-1.5 font-mono text-[8px] text-white/30">
                    {i + 1}
                  </div>
                </div>
              );
            })}

            {/* Playhead */}
            {totalDuration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-px bg-amber-400 z-20 pointer-events-none"
                style={{ left: `${playheadPct}%` }}
              >
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-amber-400 rounded-full shadow shadow-amber-400/50" />
              </div>
            )}

            {/* Time label at playhead */}
            {totalDuration > 0 && (
              <div
                className="absolute bottom-1 font-mono text-[8px] text-amber-400 z-20 pointer-events-none -translate-x-1/2"
                style={{ left: `${playheadPct}%` }}
              >
                {formatTime(currentTime)}
              </div>
            )}
          </div>

          {/* Native audio controls */}
          <audio ref={audioRef} controls src={audioUrl} className="w-full rounded-lg" />
        </section>
      )}

      {/* ── INPUT SECTION ────────────────────────────────────────────────────── */}
      <section className="px-6 py-8 flex-1">
        <label className="block text-xs font-semibold text-zinc-400 tracking-widest uppercase mb-3">
          {result ? "Generate New Storyboard" : "Script or Prose"}
        </label>
        <textarea
          className="w-full h-48 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 text-sm leading-relaxed resize-none focus:outline-none focus:border-amber-600 placeholder:text-zinc-600 font-mono"
          placeholder="Paste a screenplay (INT./EXT. headings) or prose narrative with quoted dialogue…"
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={loading}
        />
        <div className="flex items-center gap-4 mt-4">
          <button
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-semibold text-sm rounded-full transition-colors"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Processing…
              </>
            ) : "Generate Storyboard"}
          </button>
          {!loading && status && <span className="text-xs text-zinc-400 italic">{status}</span>}
        </div>
      </section>

      {/* ── VOICE CAST ───────────────────────────────────────────────────────── */}
      {result && Object.keys(result.voiceMap).length > 0 && (
        <section className="px-6 pb-6">
          <label className="block text-xs font-semibold text-zinc-400 tracking-widest uppercase mb-3">Voice Cast</label>
          <div className="flex flex-col gap-2">
            {Object.entries(result.voiceMap).map(([speaker, voice]) => {
              const colorCls = speaker === "narrator"
                ? "text-zinc-300 border-zinc-700 bg-zinc-800/60"
                : `${speakerColorMap[speaker] ?? SPEAKER_COLORS[0]} border-zinc-800 bg-zinc-900/60`;
              const textColor = colorCls.split(" ")[0];
              return (
                <div key={speaker} className={`flex items-baseline gap-2 px-3 py-2 rounded-lg border text-xs ${colorCls}`}>
                  <span className={`font-bold shrink-0 ${textColor}`}>{speaker}</span>
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

      {/* ── DEBUG PANEL ──────────────────────────────────────────────────────── */}
      {result && (
        <section className="px-6 pb-8">
          <button
            onClick={() => setDebugOpen(o => !o)}
            className="flex items-center gap-2 text-xs font-semibold text-zinc-500 tracking-widest uppercase hover:text-zinc-300 transition-colors"
          >
            <svg className={`h-3 w-3 transition-transform ${debugOpen ? "rotate-90" : ""}`} viewBox="0 0 6 10">
              <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            API Calls ({(result.storyboardFrames?.length ?? 0) + result.dialogueLines.length + (result.sfxList?.length ?? 0) + (result.musicList?.length ?? 0)})
          </button>

          {debugOpen && (
            <div className="mt-3 rounded-lg border border-zinc-800 overflow-hidden font-mono text-xs">
              {/* Image gen */}
              <div className="px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-zinc-500 uppercase tracking-widest text-[10px] font-sans font-semibold">
                Storyboard Images · gemini-2.5-flash-image · 16:9
              </div>
              {result.scenes.map(scene => {
                const frame = frameByScene[scene.index];
                return (
                  <div key={scene.index} className="flex gap-0 border-b border-zinc-800/60 last:border-0">
                    <div className="shrink-0 w-8 flex items-start justify-center pt-3 text-zinc-600">{scene.index}</div>
                    <div className="flex-1 px-2 py-2.5 border-l border-zinc-800/60 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={frame ? "text-emerald-400" : "text-red-400"}>{frame ? "✓" : "✗"}</span>
                        <span className="text-zinc-300">{scene.heading}</span>
                        <span className="ml-auto text-zinc-600 text-[10px]">
                          {toSRT(sceneStartTimes[scene.index] ?? 0)} → {toSRT(sceneEndTime(scene.index))}
                        </span>
                      </div>
                      <div className="text-zinc-600 line-clamp-1">{scene.action.slice(0, 100)}</div>
                    </div>
                  </div>
                );
              })}

              {/* TTS */}
              <div className="px-3 py-2 bg-zinc-900 border-t border-b border-zinc-800 text-zinc-500 uppercase tracking-widest text-[10px] font-sans font-semibold">
                Dialogue TTS · convertWithTimestamps · eleven_multilingual_v2
              </div>
              {result.dialogueLines.map(line => {
                const voice = result.voiceMap[line.character] ?? result.voiceMap["narrator"];
                const tone = toneMap[line.lineIndex];
                const s = { stability: tone?.stability ?? 0.35, style: tone?.style ?? 0.6 };
                const color = speakerColorMap[line.character] ?? SPEAKER_COLORS[0];
                return (
                  <div key={line.lineIndex} className="flex gap-0 border-b border-zinc-800/60 last:border-0">
                    <div className="shrink-0 w-8 flex items-start justify-center pt-3 text-zinc-600">{line.lineIndex}</div>
                    <div className="flex-1 px-2 py-2.5 border-l border-zinc-800/60 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold ${color}`}>{line.character}</span>
                        {tone && <span className="text-zinc-500 italic">{tone.emotion}</span>}
                        <span className="text-zinc-600">→</span>
                        <span className="text-amber-400">{voice?.name}</span>
                        <span className="text-zinc-600 ml-auto">scene {line.sceneIndex}</span>
                      </div>
                      <div className="text-zinc-600">stability: {s.stability.toFixed(2)}  similarity: 0.80  style: {s.style.toFixed(2)}</div>
                      <div className="text-zinc-300 line-clamp-2">&ldquo;{line.text}&rdquo;</div>
                    </div>
                  </div>
                );
              })}

              {/* SFX */}
              {(result.sfxList?.length ?? 0) > 0 && (
                <>
                  <div className="px-3 py-2 bg-zinc-900 border-t border-b border-zinc-800 text-zinc-500 uppercase tracking-widest text-[10px] font-sans font-semibold">
                    Sound Effects · textToSoundEffects · duration: 5s
                  </div>
                  {result.sfxList.map((sfx, i) => (
                    <div key={i} className="flex gap-0 border-b border-zinc-800/60 last:border-0">
                      <div className="shrink-0 w-8 flex items-start justify-center pt-3 text-zinc-600">{sfx.sceneIndex}</div>
                      <div className="flex-1 px-2 py-2.5 border-l border-zinc-800/60 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-amber-400">🔊 {sfx.prompt}</span>
                          <span className="text-zinc-600 ml-auto">@ {sfx.startTime.toFixed(2)}s</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Ambiance Music */}
              {(result.musicList?.length ?? 0) > 0 && (
                <>
                  <div className="px-3 py-2 bg-zinc-900 border-t border-b border-zinc-800 text-zinc-500 uppercase tracking-widest text-[10px] font-sans font-semibold">
                    Ambiance Music · lyria-realtime-exp · gain: 0.18
                  </div>
                  {result.musicList.map((music, i) => (
                    <div key={i} className="flex gap-0 border-b border-zinc-800/60 last:border-0">
                      <div className="shrink-0 w-8 flex items-start justify-center pt-3 text-zinc-600">{music.sceneIndex}</div>
                      <div className="flex-1 px-2 py-2.5 border-l border-zinc-800/60 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-violet-400">♪ {music.prompt}</span>
                          <span className="text-zinc-600 ml-auto">@ {music.startTime.toFixed(2)}s</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
