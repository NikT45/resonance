import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { ElevenLabsClient } from "elevenlabs";

// Voice pool: narrator + up to 5 character slots + overflow
// Descriptions sourced from ElevenLabs premade voice catalogue
const VOICE_POOL: Record<string, { id: string; name: string; description: string }> = {
  narrator: { id: "JBFqnCBsd6RMkjVDRZzb", name: "George",  description: "Raspy, middle-aged British male — purpose-built for narration" },
  slot0:    { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",  description: "Calm, young American female — optimised for narration" },
  slot1:    { id: "ErXwobaYiN019PkySvjV", name: "Antoni",  description: "Well-rounded, young American male — suited for narration" },
  slot2:    { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", description: "Warm, young American female — audiobook specialist" },
  slot3:    { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",    description: "Deep, young American male — narration" },
  slot4:    { id: "VR6AewLTigWG4xSOukaG", name: "Arnold",  description: "Crisp, middle-aged American male — narration" },
  overflow: { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi",    description: "Strong, young American female — narration" },
};

interface Segment {
  type: "narration" | "dialogue";
  text: string;
  speaker?: string;
}

interface VoiceAssignment {
  voiceId: string;
  voiceName: string;
  description: string;
}

function buildVoiceMap(segments: Segment[]): Record<string, VoiceAssignment> {
  const voiceMap: Record<string, VoiceAssignment> = {
    narrator: { voiceId: VOICE_POOL.narrator.id, voiceName: VOICE_POOL.narrator.name, description: VOICE_POOL.narrator.description },
  };
  let slotIndex = 0;

  for (const seg of segments) {
    if (seg.type === "dialogue" && seg.speaker && !voiceMap[seg.speaker]) {
      const slotKey = slotIndex < 5 ? `slot${slotIndex}` : "overflow";
      voiceMap[seg.speaker] = {
        voiceId: VOICE_POOL[slotKey].id,
        voiceName: VOICE_POOL[slotKey].name,
        description: VOICE_POOL[slotKey].description,
      };
      if (slotIndex < 5) slotIndex++;
    }
  }

  return voiceMap;
}

async function streamToBuffer(stream: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const elKey = process.env.ELEVENLABS_API_KEY;
    if (!geminiKey || !elKey) {
      return NextResponse.json(
        { error: "Missing API keys. Set GEMINI_API_KEY and ELEVENLABS_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    // Step 1: Parse text with Gemini
    const genai = new GoogleGenAI({ apiKey: geminiKey });
    const geminiPrompt = `You are a literary text parser. Analyze the following book excerpt and split it into segments of narration and dialogue.

Rules:
- Quoted text (inside " " or ' ') spoken by a character is "dialogue". Identify the speaker name from the surrounding text.
- All other text (descriptions, action, attribution phrases) is "narration".
- Preserve the original text of each segment EXACTLY as it appears.
- Return ONLY a valid JSON array with no markdown fences, no explanation. Each element must have:
  - "type": "narration" or "dialogue"
  - "text": the exact text of this segment
  - "speaker": (only for dialogue) the character's name, or "unknown" if not identifiable

Text to parse:
${text}`;

    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: geminiPrompt }] }],
    });

    const rawJson = result.text ?? "";
    // Strip possible markdown fences
    const cleaned = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let segments: Segment[];
    try {
      segments = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Gemini returned invalid JSON", raw: rawJson },
        { status: 500 }
      );
    }

    // Step 2: Build voice map
    const voiceMap = buildVoiceMap(segments);

    // Step 3: Generate audio per segment
    const elClient = new ElevenLabsClient({ apiKey: elKey });
    const narrationSettings = { stability: 0.65, similarity_boost: 0.8, style: 0.1 };
    const dialogueSettings = { stability: 0.35, similarity_boost: 0.8, style: 0.6 };

    const audioBuffers: Buffer[] = [];

    for (const seg of segments) {
      const speakerKey = seg.type === "narration" ? "narrator" : (seg.speaker ?? "unknown");
      const assignment = voiceMap[speakerKey] ?? voiceMap["narrator"];
      const settings = seg.type === "narration" ? narrationSettings : dialogueSettings;

      const audioStream = await elClient.textToSpeech.convert(assignment.voiceId, {
        text: seg.text,
        model_id: "eleven_multilingual_v2",
        voice_settings: settings,
      });

      const buffer = await streamToBuffer(audioStream as AsyncIterable<Buffer>);
      audioBuffers.push(buffer);
    }

    const combinedAudio = Buffer.concat(audioBuffers);
    const audioBase64 = combinedAudio.toString("base64");

    // Build clean voice map for response (speaker -> { name, description })
    const responseVoiceMap: Record<string, { name: string; description: string }> = {};
    for (const [speaker, assignment] of Object.entries(voiceMap)) {
      responseVoiceMap[speaker] = { name: assignment.voiceName, description: assignment.description };
    }

    return NextResponse.json({ segments, voiceMap: responseVoiceMap, audioBase64 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
