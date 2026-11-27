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

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
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
      } = req.body ?? {};

      const ai = getAiClient();
      const targetLanguage = language === 'Tamil' ? 'Tamil' : 'English';
      const languageDirective =
        targetLanguage === 'Tamil'
          ? 'Write the title, bibleReference, moralLesson, subtitleCaption, and every narrationSegment in natural, warm, kid-friendly TAMIL script (தமிழ்) suitable for children ages 4-10. Keep JSON keys, enum fields (environment, timeOfDay, weatherEffect, cameraMove, transitionIn, kind, action, mood, key), and primaryColor hex codes in English.'
          : 'Write the title, bibleReference, moralLesson, subtitleCaption, and every narrationSegment in simple, warm, engaging English suitable for children ages 4-10.';

      const themeDirective = theme
        ? `Story focus or theme requested: "${theme}".`
        : 'Pick a fresh, inspiring Bible story or parable (such as David & the Little Harp, The Good Samaritan, Noah and the Rainbow Promise, Daniel and the Gentle Lions, Jesus Calms the Storm, The Little Boy with Five Loaves and Two Fish, Zacchaeus in the Sycamore Tree, or The Lost Little Lamb).';

      const avoidRepeat = previousTitle
        ? `Do NOT repeat "${previousTitle}". Choose a completely different Bible story and characters.`
        : '';

      const prompt = `
Create an original, heartwarming animated children's Bible story video script for ages 4 to 10.
Requirements:
- Based faithfully on Bible teachings with a positive, clear moral lesson.
- 2 to 3 minutes total narration length (about 280 to 360 spoken words total across 8 animated scenes).
- Simple, vivid, joyful language with fun memorable characters (children, Bible figures, and friendly animals) and a happy ending.
- Structure into exactly 8 continuous animated scenes (around 35-45 words per scene) so every scene flows smoothly into the next with character movement, camera movement, and rich environmental animation.
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
              'You are an award-winning children Bible animated film writer and storyboard director. Output clean valid JSON strictly matching the schema.',
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
                      narrationSegment: { type: Type.STRING },
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
                      'narrationSegment',
                      'subtitleCaption',
                      'environment',
                      'timeOfDay',
                      'weatherEffect',
                      'cameraMove',
                      'transitionIn',
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
      const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
      const narrationScript = scenes
        .map((s: { narrationSegment?: string }) => s.narrationSegment ?? '')
        .filter(Boolean)
        .join('\n\n');

      const wordCount = narrationScript.split(/\s+/).filter(Boolean).length;
      const estimatedDurationSec = Math.max(95, Math.round((wordCount / 130) * 60));

      res.json({
        id: `story_${Date.now()}`,
        title: parsed.title,
        bibleReference: parsed.bibleReference,
        moralLesson: parsed.moralLesson,
        narrationScript,
        language: targetLanguage,
        voiceOption,
        theme,
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

  app.post('/api/voice/synthesize', async (req: Request, res: Response) => {
    try {
      const {
        text,
        voiceOption = 'Cute Narrator',
        language = 'English',
        isPreview = false,
      } = req.body ?? {};

      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Narration text is required.' });
        return;
      }

      const ai = getBetaAiClient();
      const { voiceName, style } = getVoiceConfig(voiceOption);
      const chunks = isPreview
        ? [text.trim().slice(0, 600)]
        : splitScriptIntoChunks(text, 750);

      const pcmBuffers: Buffer[] = [];
      let sampleRate = 24000;
      let channels = 1;
      let bitsPerSample = 16;

      for (const chunk of chunks) {
        const ttsInteraction = await withRetry(() =>
          ai.interactions.create({
            model: 'gemini-3.8-flash-lite-tts',
            input: [
              {
                type: 'text',
                text: chunk,
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

        const chunkBuffer = Buffer.from(base64Audio, 'base64');
        const extracted = extractPcmFromWav(chunkBuffer);
        sampleRate = extracted.sampleRate;
        channels = extracted.channels;
        bitsPerSample = extracted.bitsPerSample;
        pcmBuffers.push(extracted.pcm);

        // Short 220ms pause between story paragraphs
        if (!isPreview) {
          const pauseSamples = Math.floor(sampleRate * 0.22);
          const pauseBytes = pauseSamples * channels * (bitsPerSample / 8);
          pcmBuffers.push(Buffer.alloc(pauseBytes));
        }
      }

      const combinedWav = buildWavBuffer(
        pcmBuffers,
        sampleRate,
        channels,
        bitsPerSample
      );
      const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
      const totalPcmBytes = pcmBuffers.reduce((sum, b) => sum + b.length, 0);
      const durationSeconds = Math.max(1, totalPcmBytes / bytesPerSecond);

      res.json({
        audioDataUrl: `data:audio/wav;base64,${combinedWav.toString('base64')}`,
        durationSeconds,
        chunksCount: chunks.length,
        voiceName,
      });
    } catch (error: unknown) {
      console.error('Voice synthesis error:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to synthesize voice.';
      res.status(500).json({ error: message });
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
