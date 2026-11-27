import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please set it in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getBetaAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please set it in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isDailyQuotaExhausted(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('per day') ||
    lower.includes('free tier') ||
    lower.includes('too_many_requests')
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (isDailyQuotaExhausted(message)) {
        throw err;
      }
      const isTransient =
        message.includes('429') ||
        message.includes('503') ||
        message.includes('RESOURCE_EXHAUSTED') ||
        message.includes('UNAVAILABLE');
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw lastError;
}

const SERVER_NAMED_COLORS: Record<string, string> = {
  silver_blue: '#93C5FD',
  sky_blue: '#38BDF8',
  light_blue: '#60A5FA',
  royal_blue: '#2563EB',
  navy_blue: '#1E3A8A',
  blue: '#3B82F6',
  golden_yellow: '#F59E0B',
  gold: '#F59E0B',
  amber: '#D97706',
  yellow: '#FACC15',
  brown: '#92400E',
  cream: '#FEF3C7',
  white: '#F8FAFC',
  silver: '#CBD5E1',
  green: '#22C55E',
  emerald: '#10B981',
  teal: '#0D9488',
  red: '#EF4444',
  coral: '#FB7185',
  pink: '#EC4899',
  orange: '#EA580C',
  purple: '#8B5CF6',
  violet: '#7C3AED',
  indigo: '#4F46E5',
};

function sanitizeHexColor(raw: unknown, fallback = '#3B82F6'): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  const key = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  if (SERVER_NAMED_COLORS[key]) return SERVER_NAMED_COLORS[key];
  for (const [k, hex] of Object.entries(SERVER_NAMED_COLORS)) {
    if (key.includes(k)) return hex;
  }
  return fallback;
}

function detectSceneTimingsFromPcm(
  pcm: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
  sceneInputs: Array<{ sceneNumber: number; text: string }>
): Array<{
  sceneNumber: number;
  duration: number;
  audioStartSec: number;
  audioEndSec: number;
}> {
  const bytesPerSample = Math.max(1, bitsPerSample / 8);
  const bytesPerFrame = sampleRate * channels * bytesPerSample;
  const totalSec = Math.max(1, pcm.length / bytesPerFrame);

  if (sceneInputs.length <= 1) {
    return [
      {
        sceneNumber: sceneInputs[0]?.sceneNumber ?? 1,
        duration: Math.round(totalSec * 1000) / 1000,
        audioStartSec: 0,
        audioEndSec: Math.round(totalSec * 1000) / 1000,
      },
    ];
  }

  // Compute 40ms RMS energy envelope across the synthesized WAV
  const stepSec = 0.04;
  const stepSamples = Math.max(1, Math.floor(sampleRate * stepSec));
  const numWindows = Math.max(1, Math.floor(pcm.length / (stepSamples * channels * bytesPerSample)));
  const rmsEnvelope = new Float32Array(numWindows);

  for (let w = 0; w < numWindows; w++) {
    const startByte = w * stepSamples * channels * bytesPerSample;
    const endByte = Math.min(pcm.length - 1, startByte + stepSamples * channels * bytesPerSample);
    let sumSq = 0;
    let count = 0;
    for (let b = startByte; b + 1 < endByte; b += channels * 2) {
      const sample = pcm.readInt16LE(b) / 32768;
      sumSq += sample * sample;
      count++;
    }
    rmsEnvelope[w] = count > 0 ? Math.sqrt(sumSq / count) : 0;
  }

  // Proportional spoken character weight per scene
  const weights = sceneInputs.map((s) => Math.max(12, s.text.length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const boundaries: number[] = [0];
  let cumWeight = 0;
  const avgSceneSec = totalSec / sceneInputs.length;

  for (let i = 0; i < sceneInputs.length - 1; i++) {
    cumWeight += weights[i];
    const targetSec = (cumWeight / totalWeight) * totalSec;
    const prevBound = boundaries[boundaries.length - 1];
    const searchRadius = Math.min(3.5, avgSceneSec * 0.36);
    const minSec = Math.max(prevBound + 1.5, targetSec - searchRadius);
    const maxSec = Math.min(totalSec - (sceneInputs.length - 1 - i) * 1.5, targetSec + searchRadius);

    const minWin = Math.max(0, Math.floor(minSec / stepSec));
    const maxWin = Math.min(numWindows - 1, Math.ceil(maxSec / stepSec));

    let bestSec = targetSec;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let w = minWin; w <= maxWin; w++) {
      // Average 3 adjacent 40ms windows (120ms pause valley)
      const ePrev = rmsEnvelope[Math.max(0, w - 1)];
      const eCurr = rmsEnvelope[w];
      const eNext = rmsEnvelope[Math.min(numWindows - 1, w + 1)];
      const valleyEnergy = (ePrev + eCurr + eNext) / 3;
      const distPenalty = Math.abs(w * stepSec - targetSec) * 0.008;
      const score = valleyEnergy + distPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestSec = w * stepSec + stepSec * 0.5;
      }
    }

    boundaries.push(Math.round(bestSec * 1000) / 1000);
  }
  boundaries.push(Math.round(totalSec * 1000) / 1000);

  return sceneInputs.map((s, idx) => {
    const audioStartSec = boundaries[idx];
    const audioEndSec = boundaries[idx + 1];
    return {
      sceneNumber: s.sceneNumber,
      duration: Math.max(0.5, Math.round((audioEndSec - audioStartSec) * 1000) / 1000),
      audioStartSec,
      audioEndSec,
    };
  });
}

function splitScriptIntoChunks(text: string, maxChars = 750): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = cleaned.split(/(?<=[.!?।])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      const words = sentence.split(' ');
      let part = '';
      for (const word of words) {
        if ((part + ' ' + word).trim().length > maxChars) {
          if (part) chunks.push(part.trim());
          part = word;
        } else {
          part = (part + ' ' + word).trim();
        }
      }
      if (part) chunks.push(part.trim());
      continue;
    }

    if ((current + ' ' + sentence).trim().length > maxChars) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current = (current + ' ' + sentence).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function extractPcmFromWav(wavBuffer: Buffer): {
  pcm: Buffer;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
} {
  if (wavBuffer.length < 44 || wavBuffer.toString('ascii', 0, 4) !== 'RIFF') {
    return {
      pcm: wavBuffer,
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
    };
  }

  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let offset = 12;

  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ' && offset + 24 <= wavBuffer.length) {
      channels = wavBuffer.readUInt16LE(offset + 10);
      sampleRate = wavBuffer.readUInt32LE(offset + 12);
      bitsPerSample = wavBuffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      const start = offset + 8;
      const end = Math.min(wavBuffer.length, start + chunkSize);
      return {
        pcm: wavBuffer.subarray(start, end),
        sampleRate,
        channels,
        bitsPerSample,
      };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return {
    pcm: wavBuffer.subarray(44),
    sampleRate,
    channels,
    bitsPerSample,
  };
}

function buildWavBuffer(
  pcmBuffers: Buffer[],
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16
): Buffer {
  const pcmData = Buffer.concat(pcmBuffers);
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

function getVoiceConfig(voiceOption: string): {
  voiceName: string;
  style: string;
} {
  switch (voiceOption) {
    case 'Girl Character':
      return {
        voiceName: 'Kore',
        style:
          'Sweet, cheerful, expressive young girl storyteller for children, warm and bright tone',
      };
    case 'Boy Character':
      return {
        voiceName: 'Puck',
        style:
          'Friendly, curious, enthusiastic young boy storyteller for kids, joyful and clear pacing',
      };
    case 'Animal Character':
      return {
        voiceName: 'Fenrir',
        style:
          'Playful, gentle animated storybook animal character voice, warm and fun for young children',
      };
    case 'Cute Narrator':
    default:
      return {
        voiceName: 'Zephyr',
        style:
          'Warm, soft, affectionate children storybook narrator, soothing and expressive pacing for ages 4 to 10',
      };
  }
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, hasKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.post('/api/story/generate', async (req: Request, res: Response) => {
    try {
      const {
        language = 'English',
        voiceOption = 'Cute Narrator',
        theme = '',
        previousTitle = '',
        mode = 'animated',
      } = req.body ?? {};

      const videoMode = mode === 'image_slideshow' ? 'image_slideshow' : 'animated';
      const ai = getAiClient();
      const targetLanguage = language === 'Tamil' ? 'Tamil' : 'English';
      const languageDirective =
        targetLanguage === 'Tamil'
          ? 'Write the title, bibleReference, moralLesson, subtitleCaption, and every scene narration in natural, warm, kid-friendly TAMIL script (தமிழ்) suitable for children ages 4-10. Write every scene imagePrompt in clear, vivid ENGLISH illustration language directly depicting that scene narration. Keep JSON keys, enum fields (environment, timeOfDay, weatherEffect, cameraMove, transitionIn, scenicFocus, storyProps, kind, action, mood, key), and primaryColor hex codes in English.'
          : 'Write the title, bibleReference, moralLesson, subtitleCaption, every scene narration, and every scene imagePrompt in simple, warm, vivid English suitable for children ages 4-10.';

      const themeDirective = theme
        ? `Story focus or theme requested: "${theme}".`
        : 'Pick a fresh, inspiring Bible story or parable (such as David & the Little Harp, The Good Samaritan, Noah and the Rainbow Promise, Daniel and the Gentle Lions, Jesus Calms the Storm, The Little Boy with Five Loaves and Two Fish, Zacchaeus in the Sycamore Tree, or The Lost Little Lamb).';

      const avoidRepeat = previousTitle
        ? `Do NOT repeat "${previousTitle}". Choose a completely different Bible story and characters.`
        : '';

      const modeDirective =
        videoMode === 'image_slideshow'
          ? `- IMAGE STORY MODE (Exact Storybook Scene Illustrations From Narration):
  * Each scene stores narration, imagePrompt, and duration together.
  * Write each scene's "imagePrompt" DIRECTLY from that scene's "narration", describing the EXACT story illustration (all characters, animals, objects, clothing, poses, actions, setting, and warm storybook lighting mentioned in that scene's narration — NEVER just an empty background).
  * Populate "characters" with the exact people/animals present in that scene's narration (with startX equal to endX and calm storybook poses like listening, praying, celebrating, waving, flying, or swimming) so the static illustration depicts the exact storyline.
  * Populate "scenicFocus" and "storyProps" with every matching story object (e.g., rainbow_arc, wooden_ark, fishing_boat, glowing_star, loaves_and_fish, golden_harp, manger_cradle, sycamore_tree, stone_well, lions_den, shepherd_hills, stone_bridge, olive_tree, flower_arch, lantern_village, desert_palms, mountain_sunrise).`
          : `- Character acting rules: Keep characters grounded like actors in a feature film. Use "walking" ONLY when a character physically walks from one spot to another (startX != endX). Keep startX equal to endX during conversations, teaching, or listening, using "listening", "praying", or calm "celebrating" / brief "waving". Avoid "jumping" for human characters. Set scenicFocus and storyProps to match the storyline.
- Store each scene's "narration", "imagePrompt" (generated directly from that scene's narration), and estimated "duration" (in seconds, ~12-22s per scene) together in each scene object.`;

      const prompt = `
Create an original, heartwarming children's Bible story video script for ages 4 to 10.
Requirements:
- Based faithfully on Bible teachings with a positive, clear moral lesson.
- 2 to 3 minutes total narration length (about 280 to 360 spoken words total across 8 scenes).
- Simple, vivid, joyful language with memorable storytelling and a happy ending.
- Structure into exactly 8 continuous scenes (around 35-45 words per scene) so every scene flows smoothly into the next with natural film-like pacing and camera framing.
${modeDirective}
- ${themeDirective}
- ${avoidRepeat}
- ${languageDirective}
      `.trim();

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction:
              videoMode === 'image_slideshow'
                ? 'You are an award-winning children Bible storybook writer and illustration director. Every scene must bundle narration, an exact matching imagePrompt derived directly from that narration, matching characters & storyProps, and duration. Output clean valid JSON strictly matching the schema.'
                : 'You are an award-winning children Bible animated film writer and storyboard director. Output clean valid JSON strictly matching the schema.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                bibleReference: { type: Type.STRING },
                moralLesson: { type: Type.STRING },
                musicProfile: {
                  type: Type.OBJECT,
                  properties: {
                    key: {
                      type: Type.STRING,
                      enum: ['C_major', 'G_major', 'F_major'],
                    },
                    tempoBpm: { type: Type.INTEGER },
                    mood: {
                      type: Type.STRING,
                      enum: [
                        'gentle_wonder',
                        'joyful_adventure',
                        'peaceful_lullaby',
                      ],
                    },
                  },
                  required: ['key', 'tempoBpm', 'mood'],
                },
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sceneNumber: { type: Type.INTEGER },
                      title: { type: Type.STRING },
                      narration: { type: Type.STRING },
                      imagePrompt: { type: Type.STRING },
                      duration: { type: Type.NUMBER },
                      subtitleCaption: { type: Type.STRING },
                      environment: {
                        type: Type.STRING,
                        enum: [
                          'meadow',
                          'village',
                          'waterfront',
                          'desert_oasis',
                          'starry_night',
                          'hilltop',
                          'garden',
                          'rainbow_sky',
                        ],
                      },
                      timeOfDay: {
                        type: Type.STRING,
                        enum: [
                          'morning',
                          'golden_hour',
                          'noon',
                          'twilight',
                          'starlight',
                        ],
                      },
                      weatherEffect: {
                        type: Type.STRING,
                        enum: [
                          'sunbeams',
                          'fireflies',
                          'petals',
                          'rain_to_rainbow',
                          'ripples',
                          'sparkles',
                        ],
                      },
                      cameraMove: {
                        type: Type.STRING,
                        enum: [
                          'pan_right',
                          'pan_left',
                          'zoom_in',
                          'zoom_out',
                          'dolly_follow',
                          'crane_up',
                        ],
                      },
                      transitionIn: {
                        type: Type.STRING,
                        enum: [
                          'iris_open',
                          'cross_dissolve',
                          'wipe_horizon',
                          'sunburst',
                        ],
                      },
                      scenicFocus: {
                        type: Type.STRING,
                        enum: [
                          'none',
                          'rainbow_arc',
                          'wooden_ark',
                          'fishing_boat',
                          'glowing_star',
                          'shepherd_hills',
                          'stone_bridge',
                          'olive_tree',
                          'flower_arch',
                          'lantern_village',
                          'desert_palms',
                          'mountain_sunrise',
                          'loaves_and_fish',
                          'golden_harp',
                          'manger_cradle',
                          'sycamore_tree',
                          'stone_well',
                          'lions_den',
                        ],
                      },
                      storyProps: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.STRING,
                          enum: [
                            'rainbow_arc',
                            'wooden_ark',
                            'fishing_boat',
                            'glowing_star',
                            'shepherd_hills',
                            'stone_bridge',
                            'olive_tree',
                            'flower_arch',
                            'lantern_village',
                            'desert_palms',
                            'mountain_sunrise',
                            'loaves_and_fish',
                            'golden_harp',
                            'manger_cradle',
                            'sycamore_tree',
                            'stone_well',
                            'lions_den',
                          ],
                        },
                      },
                      characters: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: { type: Type.STRING },
                            kind: {
                              type: Type.STRING,
                              enum: [
                                'boy',
                                'girl',
                                'shepherd',
                                'lamb',
                                'dove',
                                'lion',
                                'fish',
                                'donkey',
                                'angel',
                              ],
                            },
                            action: {
                              type: Type.STRING,
                              enum: [
                                'walking',
                                'waving',
                                'jumping',
                                'praying',
                                'celebrating',
                                'flying',
                                'swimming',
                                'listening',
                              ],
                            },
                            mood: {
                              type: Type.STRING,
                              enum: [
                                'happy',
                                'curious',
                                'amazed',
                                'gentle',
                                'brave',
                                'joyful',
                              ],
                            },
                            primaryColor: { type: Type.STRING },
                            startX: { type: Type.NUMBER },
                            endX: { type: Type.NUMBER },
                          },
                          required: [
                            'name',
                            'kind',
                            'action',
                            'mood',
                            'primaryColor',
                            'startX',
                            'endX',
                          ],
                        },
                      },
                    },
                    required: [
                      'sceneNumber',
                      'title',
                      'narration',
                      'imagePrompt',
                      'duration',
                      'subtitleCaption',
                      'environment',
                      'timeOfDay',
                      'weatherEffect',
                      'cameraMove',
                      'transitionIn',
                      'scenicFocus',
                      'storyProps',
                      'characters',
                    ],
                  },
                },
              },
              required: [
                'title',
                'bibleReference',
                'moralLesson',
                'musicProfile',
                'scenes',
              ],
            },
          },
        })
      );

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw);
      const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
      const scenes = rawScenes.map((s: Record<string, unknown>, idx: number) => {
        const narrationText = String(s.narration ?? s.narrationSegment ?? '').trim();
        const promptText = String(s.imagePrompt ?? s.visualDescription ?? narrationText).trim();
        const wordCountScene = narrationText.split(/\s+/).filter(Boolean).length;
        const estimatedSceneDur =
          typeof s.duration === 'number' && Number.isFinite(s.duration) && s.duration > 2
            ? Math.round(s.duration * 10) / 10
            : Math.max(6, Math.round(((wordCountScene / 130) * 60) * 10) / 10);
        const chars = Array.isArray(s.characters) ? s.characters : [];
        const normalizedChars = chars.map((c: Record<string, unknown>) => ({
          ...c,
          primaryColor: sanitizeHexColor(c.primaryColor, '#3B82F6'),
          endX:
            videoMode === 'image_slideshow'
              ? typeof c.startX === 'number'
                ? c.startX
                : 0.5
              : c.endX,
        }));

        return {
          ...s,
          sceneNumber: Number(s.sceneNumber) || idx + 1,
          narration: narrationText,
          narrationSegment: narrationText,
          imagePrompt: promptText,
          visualDescription: promptText,
          duration: estimatedSceneDur,
          characters: normalizedChars,
        };
      });

      const narrationScript = scenes
        .map((s: { narration: string }) => s.narration)
        .filter(Boolean)
        .join('\n\n');

      const totalEstimated = scenes.reduce(
        (acc: number, s: { duration: number }) => acc + (s.duration || 12),
        0
      );
      const estimatedDurationSec = Math.max(
        60,
        Math.round(totalEstimated + 3.4)
      );

      res.json({
        id: `story_${Date.now()}`,
        title: parsed.title,
        bibleReference: parsed.bibleReference,
        moralLesson: parsed.moralLesson,
        narrationScript,
        language: targetLanguage,
        voiceOption,
        theme,
        videoMode,
        scenes,
        musicProfile: parsed.musicProfile ?? {
          key: 'C_major',
          tempoBpm: 84,
          mood: 'gentle_wonder',
        },
        createdAt: new Date().toISOString(),
        estimatedDurationSec,
      });
    } catch (error: unknown) {
      console.error('Story generation error:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to generate story.';
      res.status(500).json({ error: message });
    }
  });

  interface CachedTtsPayload {
    audioDataUrl: string;
    durationSeconds: number;
    chunksCount: number;
    voiceName: string;
    modelUsed: string;
    sceneTimings: Array<{
      sceneNumber: number;
      duration: number;
      audioStartSec: number;
      audioEndSec: number;
    }>;
  }
  const ttsCache = new Map<string, CachedTtsPayload>();

  app.post('/api/voice/synthesize', async (req: Request, res: Response) => {
    try {
      const {
        text,
        scenes,
        voiceOption = 'Cute Narrator',
        language = 'English',
        isPreview = false,
      } = req.body ?? {};

      const sceneInputs =
        !isPreview && Array.isArray(scenes)
          ? scenes
              .map((s: Record<string, unknown>, idx: number) => ({
                sceneNumber: Number(s?.sceneNumber) || idx + 1,
                text: String(s?.narration ?? s?.narrationSegment ?? '').trim(),
              }))
              .filter((s) => s.text.length > 0)
          : [];

      const combinedText =
        sceneInputs.length > 0
          ? sceneInputs.map((s) => s.text).join('\n\n')
          : String(text || '').trim();

      if (!combinedText) {
        res.status(400).json({ error: 'Narration text or scenes are required.' });
        return;
      }

      const { voiceName, style } = getVoiceConfig(voiceOption);
      const cacheKey = crypto
        .createHash('sha256')
        .update(`${language}|${voiceName}|${isPreview}|${combinedText}`)
        .digest('hex');

      const cached = ttsCache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const betaAi = getBetaAiClient();
      let modelUsed = 'gemini-3.8-flash-lite-tts';

      const synthesizeWithModel = async (
        modelName: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts',
        chunkText: string
      ) => {
        const ttsInteraction = await withRetry(() =>
          betaAi.interactions.create({
            model: modelName,
            input: [
              {
                type: 'text',
                text: chunkText,
                annotations: [
                  {
                    type: 'speech_metadata',
                    style: `${style}. Speak clearly in ${language}.`,
                  },
                ],
              },
            ],
            response_format: { type: 'audio' },
            generation_config: {
              speech_config: [
                {
                  language: language === 'Tamil' ? 'ta-IN' : 'en-US',
                  voice: voiceName as
                    | 'Puck'
                    | 'Charon'
                    | 'Kore'
                    | 'Fenrir'
                    | 'Zephyr',
                },
              ],
            },
          })
        );

        const base64Audio = ttsInteraction.output_audio?.data;
        if (!base64Audio) {
          throw new Error('Gemini TTS did not return audio data.');
        }
        return extractPcmFromWav(Buffer.from(base64Audio, 'base64'));
      };

      const synthesizeChunkWithFallback = async (chunkText: string) => {
        // 1. Primary: gemini-3.8-flash-lite-tts (1 request per full story up to 3200 chars)
        try {
          modelUsed = 'gemini-3.8-flash-lite-tts';
          return await synthesizeWithModel('gemini-3.8-flash-lite-tts', chunkText);
        } catch (primaryErr: unknown) {
          const primaryMsg =
            primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
          const isQuotaErr =
            primaryMsg.includes('429') ||
            primaryMsg.includes('RESOURCE_EXHAUSTED') ||
            primaryMsg.includes('too_many_requests');

          if (!isQuotaErr) {
            throw primaryErr;
          }

          // 2. Fallback: gemini-3.8-flash-tts via v1beta Interactions API
          try {
            modelUsed = 'gemini-3.8-flash-tts';
            return await synthesizeWithModel('gemini-3.8-flash-tts', chunkText);
          } catch (fallbackErr: unknown) {
            const fallbackMsg =
              fallbackErr instanceof Error
                ? fallbackErr.message
                : String(fallbackErr);
            if (
              fallbackMsg.includes('429') ||
              fallbackMsg.includes('RESOURCE_EXHAUSTED') ||
              fallbackMsg.includes('too_many_requests')
            ) {
              throw fallbackErr;
            }
            throw primaryErr;
          }
        }
      };

      // Use large 3200-char chunks so an entire 8-scene Bible story completes in 1 single TTS call
      const chunks = isPreview
        ? [combinedText.slice(0, 600)]
        : splitScriptIntoChunks(combinedText, 3200);

      const pcmBuffers: Buffer[] = [];
      let sampleRate = 24000;
      let channels = 1;
      let bitsPerSample = 16;

      for (let i = 0; i < chunks.length; i++) {
        const extracted = await synthesizeChunkWithFallback(chunks[i]);
        sampleRate = extracted.sampleRate;
        channels = extracted.channels;
        bitsPerSample = extracted.bitsPerSample;
        pcmBuffers.push(extracted.pcm);

        if (!isPreview && i < chunks.length - 1) {
          const pauseSamples = Math.floor(sampleRate * 0.25);
          const pauseBytes = pauseSamples * channels * (bitsPerSample / 8);
          pcmBuffers.push(Buffer.alloc(pauseBytes));
        }
      }

      const fullPcm = Buffer.concat(pcmBuffers);
      const sceneTimings =
        sceneInputs.length > 0
          ? detectSceneTimingsFromPcm(
              fullPcm,
              sampleRate,
              channels,
              bitsPerSample,
              sceneInputs
            )
          : [];

      const combinedWav = buildWavBuffer(
        [fullPcm],
        sampleRate,
        channels,
        bitsPerSample
      );
      const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
      const durationSeconds = Math.max(1, fullPcm.length / bytesPerSecond);

      const payload: CachedTtsPayload = {
        audioDataUrl: `data:audio/wav;base64,${combinedWav.toString('base64')}`,
        durationSeconds,
        chunksCount: chunks.length,
        voiceName,
        modelUsed,
        sceneTimings,
      };

      if (ttsCache.size >= 20) {
        const oldestKey = ttsCache.keys().next().value;
        if (oldestKey) ttsCache.delete(oldestKey);
      }
      ttsCache.set(cacheKey, payload);

      res.json(payload);
    } catch (error: unknown) {
      console.error('Voice synthesis error:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to synthesize voice.';
      const status =
        message.includes('429') ||
        message.includes('too_many_requests') ||
        message.includes('RESOURCE_EXHAUSTED')
          ? 429
          : 500;
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/youtube/metadata', async (req: Request, res: Response) => {
    try {
      const {
        title,
        bibleReference,
        moralLesson,
        narrationScript,
        language = 'English',
        durationSeconds = 135,
      } = req.body ?? {};

      if (!title || !narrationScript) {
        res.status(400).json({ error: 'Story title and script are required.' });
        return;
      }

      const ai = getAiClient();
      const mins = Math.floor(durationSeconds / 60);
      const secs = Math.round(durationSeconds % 60);
      const formattedDuration = `${String(mins).padStart(2, '0')}:${String(
        secs
      ).padStart(2, '0')}`;

      const prompt = `
Generate a complete, high-CTR, family-safe YouTube publishing package inspired by YouTube SEO best practices (youtube-agent-skill) for this Bible Kids animated story video:

Story Title: ${title}
Bible Reference: ${bibleReference || 'Holy Bible'}
Moral Lesson: ${moralLesson || 'Kindness and faith'}
Language: ${language}
Duration: ${formattedDuration}
Script Excerpt: ${narrationScript.slice(0, 1800)}

Requirements:
1. title: SEO-optimized, curiosity-sparking, family-friendly YouTube Title (max 75 chars, in ${language} or bilingual if Tamil).
2. description: Complete YouTube Description formatted cleanly for parents & Sunday school teachers including:
   - Warm Story Summary
   - Key Bible Lesson & Verse
   - Positive Call to Action (Subscribe, Like, Share with family)
   - Kid-friendly chapter markers / notes
3. keywords: EXACTLY 30 high-intent SEO keywords for Bible stories for kids.
4. hashtags: EXACTLY 15 relevant hashtags (each starting with #).
5. category: YouTube category (e.g. "Education" or "Film & Animation").
6. targetAudience: Clear audience note (e.g. "Children ages 4-10, Christian families, Sunday School classrooms (Made for Kids / COPPA compliant)").
7. estimatedDuration: "${formattedDuration}"
8. thumbnailPrompt: Detailed AI image generation prompt for a vibrant, high-CTR 16:9 YouTube thumbnail (bright expressive characters, warm golden lighting, clear focal composition, no cluttered text).
9. tags: 18 concise YouTube video tags.
10. publishingNotes: Practical COPPA / Made-for-Kids, end-screen, and Sunday morning posting guidance.
      `.trim();

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction:
              'You are a YouTube Kids & Family Content SEO Strategist. Return clean valid JSON matching the exact schema.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                keywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                hashtags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                category: { type: Type.STRING },
                targetAudience: { type: Type.STRING },
                estimatedDuration: { type: Type.STRING },
                thumbnailPrompt: { type: Type.STRING },
                tags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                publishingNotes: { type: Type.STRING },
              },
              required: [
                'title',
                'description',
                'keywords',
                'hashtags',
                'category',
                'targetAudience',
                'estimatedDuration',
                'thumbnailPrompt',
                'tags',
                'publishingNotes',
              ],
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error: unknown) {
      console.error('YouTube metadata error:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate YouTube metadata.';
      res.status(500).json({ error: message });
    }
  });

  interface UploadSession {
    uploadUrl: string;
    channelTitle: string;
    channelHandle: string;
    mimeType: string;
    expiresAt: number;
  }

  const uploadSessions = new Map<string, UploadSession>();

  function mapYouTubeCategoryId(category: string): string {
    const lower = (category || '').toLowerCase();
    if (lower.includes('film') || lower.includes('animation')) return '1';
    if (lower.includes('music')) return '10';
    if (lower.includes('people') || lower.includes('blog')) return '22';
    if (lower.includes('entertainment')) return '24';
    return '27'; // Education
  }

  function sanitizeYouTubeTags(rawTags: string[]): string[] {
    const clean: string[] = [];
    let totalLen = 0;
    for (const raw of rawTags) {
      const t = String(raw || '')
        .replace(/^#+/, '')
        .replace(/[<>]/g, '')
        .trim();
      if (!t || clean.includes(t)) continue;
      if (totalLen + t.length + 2 > 450) break;
      clean.push(t);
      totalLen += t.length + 2;
    }
    return clean;
  }

  function toScheduledUtcIso(
    dateStr: string,
    timeStr: string,
    timezone: string
  ): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    if (!year || !month || !day) {
      return new Date(Date.now() + 3_600_000).toISOString();
    }
    const localGuess = new Date(
      Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0)
    );
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const parts = Object.fromEntries(
        fmt.formatToParts(localGuess).map((p) => [p.type, p.value])
      );
      const tzRenderedUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour === '24' ? '0' : parts.hour),
        Number(parts.minute),
        Number(parts.second)
      );
      const offsetMs = tzRenderedUtc - localGuess.getTime();
      const target = new Date(localGuess.getTime() - offsetMs);
      return target.toISOString();
    } catch {
      return localGuess.toISOString();
    }
  }

  app.post('/api/youtube/upload/init', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Missing Google OAuth Bearer token. Please sign in with Google first.',
        });
        return;
      }
      const accessToken = authHeader.slice(7).trim();

      const {
        title,
        description,
        tags = [],
        hashtags = [],
        category = 'Education',
        language = 'English',
        scheduledDate,
        scheduledTime,
        timezone = 'UTC',
        privacyMode = 'scheduled',
        contentLength,
        mimeType = 'video/mp4',
      } = req.body ?? {};

      if (!title || !description || !contentLength) {
        res.status(400).json({
          error: 'Video title, description, and contentLength are required.',
        });
        return;
      }

      // 1. Verify connected YouTube channel via Bearer token
      const chRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const chJson = (await chRes.json().catch(() => ({}))) as {
        items?: Array<{
          id?: string;
          snippet?: { title?: string; customUrl?: string };
        }>;
        error?: { message?: string };
      };
      if (!chRes.ok) {
        res.status(chRes.status).json({
          error:
            chJson.error?.message ||
            'Failed to verify your YouTube channel permissions.',
        });
        return;
      }

      const channel = chJson.items?.[0];
      if (!channel) {
        res.status(400).json({
          error:
            'No YouTube channel found on the signed-in Google account. Please select your @A-VerseForYou channel account.',
        });
        return;
      }

      const channelTitle = channel.snippet?.title || 'YouTube Channel';
      const channelHandle = channel.snippet?.customUrl || channel.id || '';

      // 2. Prepare YouTube Data API v3 snippet & status
      const hashtagBlock = Array.isArray(hashtags) && hashtags.length
        ? `\n\n${hashtags.slice(0, 15).join(' ')}`
        : '';
      const fullDescription = `${String(description).trim()}${hashtagBlock}`.slice(
        0,
        4950
      );

      const statusPayload: Record<string, unknown> = {
        selfDeclaredMadeForKids: true,
      };

      let scheduledIso = new Date().toISOString();
      if (privacyMode === 'scheduled' && scheduledDate && scheduledTime) {
        const targetUtc = toScheduledUtcIso(
          scheduledDate,
          scheduledTime,
          timezone
        );
        const targetMs = new Date(targetUtc).getTime();
        if (targetMs > Date.now() + 60_000) {
          statusPayload.privacyStatus = 'private';
          statusPayload.publishAt = targetUtc;
          scheduledIso = targetUtc;
        } else {
          statusPayload.privacyStatus = 'private';
        }
      } else if (
        privacyMode === 'public' ||
        privacyMode === 'unlisted' ||
        privacyMode === 'private'
      ) {
        statusPayload.privacyStatus = privacyMode;
      } else {
        statusPayload.privacyStatus = 'private';
      }

      const langCode = language === 'Tamil' ? 'ta' : 'en';
      const videoResource = {
        snippet: {
          title: String(title).trim().slice(0, 100),
          description: fullDescription,
          tags: sanitizeYouTubeTags(Array.isArray(tags) ? tags : []),
          categoryId: mapYouTubeCategoryId(category),
          defaultLanguage: langCode,
          defaultAudioLanguage: langCode,
        },
        status: statusPayload,
      };

      const initRes = await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(contentLength),
            'X-Upload-Content-Type': String(mimeType || 'video/mp4'),
          },
          body: JSON.stringify(videoResource),
        }
      );

      if (!initRes.ok) {
        const errData = (await initRes.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        res.status(initRes.status).json({
          error:
            errData.error?.message ||
            `YouTube upload initialization failed (HTTP ${initRes.status}).`,
        });
        return;
      }

      const uploadUrl = initRes.headers.get('location');
      if (
        !uploadUrl ||
        (!uploadUrl.startsWith('https://www.googleapis.com/') &&
          !uploadUrl.startsWith('https://upload.youtube.com/'))
      ) {
        res.status(502).json({
          error: 'YouTube API did not return a valid resumable upload URL.',
        });
        return;
      }

      // Clean expired sessions
      const now = Date.now();
      for (const [k, v] of uploadSessions.entries()) {
        if (v.expiresAt < now) uploadSessions.delete(k);
      }

      const uploadSessionId = crypto.randomUUID();
      uploadSessions.set(uploadSessionId, {
        uploadUrl,
        channelTitle,
        channelHandle,
        mimeType: String(mimeType || 'video/mp4'),
        expiresAt: now + 15 * 60_000,
      });

      res.json({
        uploadSessionId,
        channelTitle,
        channelHandle,
        scheduledIso,
      });
    } catch (error: unknown) {
      console.error('YouTube upload init error:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to initialize YouTube upload.',
      });
    }
  });

  app.post(
    '/api/youtube/upload/binary',
    express.raw({ type: 'application/octet-stream', limit: '250mb' }),
    async (req: Request, res: Response) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).json({ error: 'Missing OAuth Bearer token.' });
          return;
        }
        const accessToken = authHeader.slice(7).trim();
        const sessionId = String(req.headers['x-upload-session-id'] || '');
        const session = uploadSessions.get(sessionId);
        if (!session || session.expiresAt < Date.now()) {
          uploadSessions.delete(sessionId);
          res.status(400).json({ error: 'Upload session expired or invalid.' });
          return;
        }
        uploadSessions.delete(sessionId);

        const videoBuffer = req.body as Buffer;
        if (!Buffer.isBuffer(videoBuffer) || videoBuffer.length === 0) {
          res.status(400).json({ error: 'Empty video binary payload.' });
          return;
        }

        const putRes = await fetch(session.uploadUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': session.mimeType,
            'Content-Length': String(videoBuffer.length),
          },
          body: new Uint8Array(videoBuffer),
        });

        const uploaded = (await putRes.json().catch(() => ({}))) as {
          id?: string;
          status?: { privacyStatus?: string; publishAt?: string };
          error?: { message?: string };
        };

        if (!putRes.ok || !uploaded.id) {
          res.status(putRes.status || 502).json({
            error:
              uploaded.error?.message ||
              `YouTube video upload failed (HTTP ${putRes.status}).`,
          });
          return;
        }

        res.json({
          publishId: uploaded.id,
          videoId: uploaded.id,
          youtubeUrl: `https://www.youtube.com/watch?v=${uploaded.id}`,
          studioUrl: `https://studio.youtube.com/video/${uploaded.id}/edit`,
          channelTitle: session.channelTitle,
          channelHandle: session.channelHandle,
          publishedAt: new Date().toISOString(),
          scheduledIso:
            uploaded.status?.publishAt || new Date().toISOString(),
          status: uploaded.status?.publishAt ? 'Scheduled' : 'Uploaded',
        });
      } catch (error: unknown) {
        console.error('YouTube binary upload error:', error);
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to upload video to YouTube.',
        });
      }
    }
  );

  app.post('/api/youtube/publish', (req: Request, res: Response) => {
    const payload = req.body ?? {};
    const {
      title,
      description,
      tags,
      hashtags,
      category,
      thumbnailPrompt,
      scheduledDate,
      scheduledTime,
      timezone,
      videoUrl,
    } = payload;

    if (!title || !description || !scheduledDate || !scheduledTime) {
      res.status(400).json({
        error:
          'Title, description, scheduledDate, and scheduledTime are required.',
      });
      return;
    }

    const publishId = `yt_pkg_${Date.now().toString(36)}`;
    const scheduledIso = `${scheduledDate}T${scheduledTime}:00`;

    res.json({
      publishId,
      publishedAt: new Date().toISOString(),
      scheduledIso,
      status: 'Scheduled',
      payload: {
        title,
        description,
        tags: Array.isArray(tags) ? tags : [],
        hashtags: Array.isArray(hashtags) ? hashtags : [],
        category: category || 'Education',
        thumbnailPrompt: thumbnailPrompt || '',
        scheduledDate,
        scheduledTime,
        timezone: timezone || 'UTC',
        videoUrl: videoUrl || '',
      },
    });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*all', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bible Kids Video Creator server listening on port ${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
