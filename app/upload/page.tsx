"use client";

import Link from "next/link";
import Image from "next/image";
import { ChangeEvent, useRef, useState } from "react";

interface ScriptScene {
  index: number;
  heading: string;
  action: string;
}

interface ScriptDialogueLine {
  sceneIndex: number;
  lineIndex: number;
  character: string;
  parenthetical?: string;
  text: string;
}

interface StoryboardFrame {
  sceneIndex: number;
  imageBase64: string;
  mimeType: string;
}

interface SfxItem {
  sceneIndex: number;
  prompt: string;
  startTime: number;
  audioBase64: string;
}

interface MusicItem {
  sceneIndex: number;
  prompt: string;
  startTime: number;
  audioBase64: string;
}

interface DialogueTone {
  lineIndex: number;
  stability: number;
  style: number;
  emotion: string;
}

interface VoiceInfo {
  name: string;
  description: string;
}

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

interface SpeakerStyle {
  chipClass: string;
  panelClass: string;
}

const SPEAKER_STYLES: SpeakerStyle[] = [
  { chipClass: "speaker-chip-rose", panelClass: "speaker-panel-rose" },
  { chipClass: "speaker-chip-sky", panelClass: "speaker-panel-sky" },
  { chipClass: "speaker-chip-emerald", panelClass: "speaker-panel-emerald" },
  { chipClass: "speaker-chip-violet", panelClass: "speaker-panel-violet" },
  { chipClass: "speaker-chip-orange", panelClass: "speaker-panel-orange" },
  { chipClass: "speaker-chip-pink", panelClass: "speaker-panel-pink" },
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
I don't know. But they left something behind.`;

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function audioBufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = buf.numberOfChannels;
  const sr = buf.sampleRate;
  const len = buf.length;
  const dataSize = len * numCh * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);

  writeString(v, 0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeString(v, 8, "WAVE");
  writeString(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * numCh * 2, true);
  v.setUint16(32, numCh * 2, true);
  v.setUint16(34, 16, true);
  writeString(v, 36, "data");
  v.setUint32(40, dataSize, true);

  let off = 44;
  for (let f = 0; f < len; f++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buf.getChannelData(ch)[f]));
      v.setInt16(off, s < 0 ? s * 32768 : s * 32767, true);
      off += 2;
    }
  }

  return ab;
}

const GAP_DLG_TO_DLG = 0.12;
const GAP_BETWEEN_SCENES = 0.5;

async function decodeB64Audio(b64: string): Promise<AudioBuffer> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
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
  sceneStartTimes: number[],
): Promise<string> {
  const lineBuffers: AudioBuffer[] = [];
  for (const b64 of linesAudio) {
    try {
      lineBuffers.push(await decodeB64Audio(b64));
    } catch {
      const ctx = new AudioContext();
      lineBuffers.push(ctx.createBuffer(1, 1, 44100));
      await ctx.close();
    }
  }

  const startTimes: number[] = [];
  let cursor = 0;
  for (let i = 0; i < dialogueLines.length; i++) {
    if (i > 0) {
      cursor += dialogueLines[i - 1].sceneIndex !== dialogueLines[i].sceneIndex ? GAP_BETWEEN_SCENES : GAP_DLG_TO_DLG;
    }
    startTimes.push(cursor);
    cursor += lineBuffers[i]?.duration ?? 0;
  }

  const sfxDecoded: { buffer: AudioBuffer; startTime: number }[] = [];
  for (const sfx of sfxList) {
    try {
      const buf = await decodeB64Audio(sfx.audioBase64);
      sfxDecoded.push({ buffer: buf, startTime: sceneStartTimes[sfx.sceneIndex] ?? sfx.startTime });
    } catch {
      // skip
    }
  }

  const musicDecoded: { buffer: AudioBuffer; startTime: number }[] = [];
  for (const music of musicList) {
    try {
      const buf = await decodeB64Audio(music.audioBase64);
      musicDecoded.push({ buffer: buf, startTime: sceneStartTimes[music.sceneIndex] ?? music.startTime });
    } catch {
      // skip
    }
  }

  const sampleRate = lineBuffers[0]?.sampleRate ?? 44100;
  const numChannels = lineBuffers[0]?.numberOfChannels ?? 1;
  const totalDuration = Math.max(
    cursor,
    sfxDecoded.reduce((m, { buffer, startTime }) => Math.max(m, startTime + buffer.duration), 0),
    musicDecoded.reduce((m, { buffer, startTime }) => Math.max(m, startTime + buffer.duration), 0),
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
      for (let s = 0; s < data.length; s++) {
        const abs = Math.abs(data[s]);
        if (abs > peak) peak = abs;
      }
    }

    const src = offCtx.createBufferSource();
    src.buffer = buffer;
    const gain = offCtx.createGain();
    gain.gain.value = peak > 0 ? TARGET_PEAK / peak : TARGET_PEAK;
    src.connect(gain);
    gain.connect(offCtx.destination);
    src.start(startTime);
  }

  for (const { buffer, startTime } of musicDecoded) {
    const src = offCtx.createBufferSource();
    src.buffer = buffer;
    const gain = offCtx.createGain();
    gain.gain.value = 0.18;
    src.connect(gain);
    gain.connect(offCtx.destination);
    src.start(startTime);
  }

  const rendered = await offCtx.startRendering();
  return URL.createObjectURL(new Blob([audioBufferToWav(rendered)], { type: "audio/wav" }));
}

export default function UploadPage() {
  const [inputMode, setInputMode] = useState<"text" | "pdf">("text");
  const [text, setText] = useState(SAMPLE_TEXT);
  const [selectedFileName, setSelectedFileName] = useState("");

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const prevAudioUrl = useRef<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);

    const isPlainText = file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (isPlainText) {
      const contents = await file.text();
      setText(contents);
      setInputMode("text");
      setStatus("Loaded text file. Review and click Generate audio.");
      return;
    }

    if (isPdf) {
      setStatus("PDF selected. Paste script text below, then click Generate audio.");
      return;
    }

    setStatus("Unsupported file type. Upload a PDF or TXT file.");
  }

  async function handleGenerate() {
    if (!text.trim()) {
      setStatus("Please paste script text to continue.");
      return;
    }

    setLoading(true);
    setStatus("Analyzing script and generating voices...");
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

      const data: GenerateResponse = await res.json();

      if (!res.ok || data.error) {
        setStatus(`Error: ${data.error ?? "Unknown error"}`);
        setLoading(false);
        return;
      }

      setStatus("Mixing dialogue, SFX, and soundtrack...");
      const url = await mixAudio(
        data.linesAudio,
        data.dialogueLines,
        data.sfxList ?? [],
        data.musicList ?? [],
        data.sceneStartTimes ?? [],
      );

      prevAudioUrl.current = url;
      setAudioUrl(url);
      setResult(data);
      setStatus("Ready.");
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  function getSpeakerStyleMap(voiceMap: Record<string, VoiceInfo>): Record<string, SpeakerStyle> {
    const styleMap: Record<string, SpeakerStyle> = {};
    let idx = 0;

    for (const speaker of Object.keys(voiceMap)) {
      if (speaker === "narrator") continue;
      styleMap[speaker] = SPEAKER_STYLES[idx % SPEAKER_STYLES.length];
      idx++;
    }

    return styleMap;
  }

  const speakerStyleMap = result ? getSpeakerStyleMap(result.voiceMap) : {};
  const toneMap = result
    ? Object.fromEntries((result.dialogueTones ?? []).map((tone) => [tone.lineIndex, tone]))
    : ({} as Record<number, DialogueTone>);
  const sceneSfxMap = result ? Object.fromEntries((result.sfxList ?? []).map((sfx) => [sfx.sceneIndex, sfx.prompt])) : {};

  return (
    <div className="upload-page">
      <header className="site-header">
        <div className="container header-shell">
          <Link className="brand" href="/" aria-label="Resonance home">
            <Image
              src="/resonance-logo-book-transparent.png"
              alt="Resonance"
              className="brand-logo"
              width={220}
              height={80}
              priority
            />
          </Link>

          <nav className="main-nav" aria-label="Primary">
            <Link href="/">Home</Link>
            <a href="#studio">Studio</a>
            <a href="#results">Results</a>
          </nav>

          <div className="header-actions">
            <Link className="btn btn-secondary" href="/">
              Back home
            </Link>
          </div>
        </div>
      </header>

      <main className="section">
        <div className="container upload-main" id="studio">
          <section className="studio-card">
            <p className="eyebrow">Upload page</p>
            <h1 className="upload-title">Upload script and generate audio.</h1>
            <p className="upload-lead">
              Pick text input or PDF upload, then click one button to generate your immersive script audio.
            </p>

            <div className="mode-switch" role="tablist" aria-label="Input mode">
              <button
                className={`mode-btn ${inputMode === "text" ? "active" : ""}`}
                type="button"
                role="tab"
                onClick={() => setInputMode("text")}
                aria-selected={inputMode === "text"}
              >
                Text input
              </button>
              <button
                className={`mode-btn ${inputMode === "pdf" ? "active" : ""}`}
                type="button"
                role="tab"
                onClick={() => setInputMode("pdf")}
                aria-selected={inputMode === "pdf"}
              >
                PDF upload
              </button>
            </div>

            {inputMode === "pdf" && (
              <div className="upload-mode-card">
                <label className="dropzone" htmlFor="script-file">
                  <input
                    id="script-file"
                    type="file"
                    accept=".pdf,.txt,text/plain,application/pdf"
                    onChange={handleFileChange}
                  />
                  <span className="dropzone-title">Drop your PDF or TXT file here</span>
                  <span className="dropzone-subtitle">or click to choose a file</span>
                </label>

                {selectedFileName && <p className="file-chip">Selected: {selectedFileName}</p>}
                <p className="mode-note">For PDFs, paste script text below before generating.</p>
              </div>
            )}

            <div className="upload-mode-card">
              <label htmlFor="script-text" className="field-label">
                Script text
              </label>
              <textarea
                id="script-text"
                className="script-textarea"
                placeholder="Paste your script excerpt here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="action-row">
              <button className="btn btn-primary" type="button" onClick={handleGenerate} disabled={loading}>
                {loading ? "Generating..." : "Generate audio"}
              </button>
              {status && <p className="status-copy">{status}</p>}
            </div>
          </section>

          <section className="studio-card" id="results">
            <h2 className="panel-title">Preview</h2>
            {audioUrl ? (
              <audio controls src={audioUrl} className="audio-player" />
            ) : (
              <p className="placeholder-copy">Generated audio will appear here.</p>
            )}

            {result && Object.keys(result.voiceMap).length > 0 && (
              <div className="voice-cast">
                <h3 className="subhead">Voice cast</h3>
                <div className="voice-grid">
                  {Object.entries(result.voiceMap).map(([speaker, voice]) => {
                    const style = speakerStyleMap[speaker];
                    return (
                      <article
                        key={speaker}
                        className={`voice-chip ${speaker === "narrator" ? "speaker-chip-neutral" : style?.chipClass ?? "speaker-chip-rose"}`}
                      >
                        <strong>{speaker}</strong>
                        <span>{voice.name}</span>
                        <em>{voice.description}</em>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {result && result.dialogueLines.length > 0 && (
              <div className="segments-wrap">
                <h3 className="subhead">Script scenes and lines</h3>

                <div className="scene-list">
                  {result.scenes.map((scene) => (
                    <article key={scene.index} className="scene-card">
                      <div className="scene-head">
                        <p className="scene-heading">{scene.heading}</p>
                        {sceneSfxMap[scene.index] && <span className="sfx-pill">SFX: {sceneSfxMap[scene.index]}</span>}
                      </div>
                      <p className="scene-action">{scene.action}</p>

                      <div className="segment-list">
                        {result.dialogueLines
                          .filter((line) => line.sceneIndex === scene.index)
                          .map((line) => {
                            const style = speakerStyleMap[line.character] ?? SPEAKER_STYLES[0];
                            const tone = toneMap[line.lineIndex];
                            return (
                              <article
                                key={`${line.sceneIndex}-${line.lineIndex}`}
                                className={`segment-card dialogue-card ${style.panelClass}`}
                              >
                                <div className="dialogue-head">
                                  <span className="speaker-tag">{line.character}</span>
                                  {line.parenthetical && <span className="parenthetical-tag">({line.parenthetical})</span>}
                                  {tone && <span className="tone-tag">{tone.emotion}</span>}
                                </div>
                                <p>{line.text}</p>
                              </article>
                            );
                          })}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
