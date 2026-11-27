import * as Mp4Muxer from 'mp4-muxer';
import type {
  GeneratedStory,
  SceneEnvironment,
  StoryScene,
  TimeOfDay,
} from '../types/story';
import {
  drawCharacter,
  type CharacterRenderSpec,
  type TimeLighting,
} from './characterRenderer';

export { drawCharacter, type CharacterRenderSpec };

export const WIDTH = 1280;
export const HEIGHT = 720;
const FPS = 24;

const ENVIRONMENT_BACKDROPS: Record<SceneEnvironment, string> = {
  meadow: '/src/assets/images/bg_meadow_valley_1795737036662.jpg',
  village: '/src/assets/images/bg_storybook_village_1795737037057.jpg',
  waterfront: '/src/assets/images/bg_sunlit_river_1795737037171.jpg',
  desert_oasis: '/src/assets/images/bg_desert_oasis_1795737054638.jpg',
  starry_night: '/src/assets/images/bg_starry_night_1795737055652.jpg',
  rainbow_sky: '/src/assets/images/bg_rainbow_valley_1795737055343.jpg',
  garden: '/src/assets/images/bg_sunlit_garden_1795737073634.jpg',
  hilltop: '/src/assets/images/bg_mountain_hilltop_1795737073107.jpg',
};

const backdropImageCache = new Map<string, HTMLImageElement>();
const backdropLoadPromises = new Map<string, Promise<HTMLImageElement | null>>();
let painterlyGrainPattern: CanvasPattern | null = null;

function loadBackdropImage(url: string): Promise<HTMLImageElement | null> {
  const existing = backdropLoadPromises.get(url);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      backdropImageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

  backdropLoadPromises.set(url, promise);
  return promise;
}

export function getBackdropImage(env: SceneEnvironment): HTMLImageElement | null {
  const url = ENVIRONMENT_BACKDROPS[env] || ENVIRONMENT_BACKDROPS.meadow;
  const cached = backdropImageCache.get(url);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return cached;
  }
  void loadBackdropImage(url);
  return null;
}

export async function preloadEnvironmentBackdrops(
  scenes?: StoryScene[]
): Promise<void> {
  const urls = scenes?.length
    ? Array.from(
        new Set(
          scenes.map(
            (s) => ENVIRONMENT_BACKDROPS[s.environment] || ENVIRONMENT_BACKDROPS.meadow
          )
        )
      )
    : Object.values(ENVIRONMENT_BACKDROPS);
  await Promise.all(urls.map((u) => loadBackdropImage(u)));
}

export function getPainterlyGrainPattern(
  ctx: CanvasRenderingContext2D
): CanvasPattern | null {
  if (painterlyGrainPattern) return painterlyGrainPattern;
  if (typeof document === 'undefined') return null;

  const tile = document.createElement('canvas');
  tile.width = 96;
  tile.height = 96;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;

  const imgData = tctx.createImageData(96, 96);
  const d = imgData.data;
  let seed = 1337;
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = 115 + (seed % 32);
    d[i] = v;
    d[i + 1] = v - 4;
    d[i + 2] = v - 10;
    d[i + 3] = 16;
  }
  tctx.putImageData(imgData, 0, 0);
  painterlyGrainPattern = ctx.createPattern(tile, 'repeat');
  return painterlyGrainPattern;
}

export const TIME_LIGHTING: Record<TimeOfDay, TimeLighting> = {
  morning: {
    skyTop: '#2563EB',
    skyBottom: '#DBEAFE',
    gradeColor: 'rgba(254, 243, 199, 0.12)',
    gradeBlend: 'soft-light',
    rimLight: 'rgba(255, 248, 214, 0.42)',
    shadowTint: 'rgba(30, 58, 138, 0.14)',
    sunCore: '#FFFBEB',
    sunGlow: 'rgba(253, 224, 71, 0.34)',
    characterTint: 'rgba(255, 247, 224, 0.08)',
  },
  noon: {
    skyTop: '#1D4ED8',
    skyBottom: '#E0F2FE',
    gradeColor: 'rgba(255, 251, 235, 0.08)',
    gradeBlend: 'soft-light',
    rimLight: 'rgba(255, 255, 240, 0.38)',
    shadowTint: 'rgba(30, 41, 59, 0.14)',
    sunCore: '#FFFFFF',
    sunGlow: 'rgba(254, 240, 138, 0.28)',
    characterTint: 'rgba(255, 255, 255, 0.04)',
  },
  golden_hour: {
    skyTop: '#4338CA',
    skyBottom: '#FDE68A',
    gradeColor: 'rgba(251, 146, 60, 0.22)',
    gradeBlend: 'soft-light',
    rimLight: 'rgba(254, 215, 102, 0.56)',
    shadowTint: 'rgba(67, 20, 7, 0.18)',
    sunCore: '#FFF7CC',
    sunGlow: 'rgba(251, 146, 60, 0.44)',
    characterTint: 'rgba(251, 191, 36, 0.14)',
  },
  twilight: {
    skyTop: '#1E1B4B',
    skyBottom: '#C084FC',
    gradeColor: 'rgba(67, 56, 202, 0.32)',
    gradeBlend: 'multiply',
    rimLight: 'rgba(244, 180, 140, 0.4)',
    shadowTint: 'rgba(30, 27, 75, 0.26)',
    sunCore: '#FDE68A',
    sunGlow: 'rgba(244, 114, 182, 0.3)',
    characterTint: 'rgba(99, 102, 241, 0.16)',
  },
  starlight: {
    skyTop: '#0B1120',
    skyBottom: '#1E3A8A',
    gradeColor: 'rgba(15, 23, 54, 0.44)',
    gradeBlend: 'multiply',
    rimLight: 'rgba(186, 230, 253, 0.42)',
    shadowTint: 'rgba(15, 23, 42, 0.32)',
    sunCore: '#F8FAFC',
    sunGlow: 'rgba(147, 197, 253, 0.28)',
    characterTint: 'rgba(59, 130, 246, 0.16)',
  },
};

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function easeInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawPaintedFallbackBackdrop(
  ctx: CanvasRenderingContext2D,
  scene: StoryScene,
  lighting: TimeLighting,
  timeSec: number
) {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.65);
  skyGrad.addColorStop(0, lighting.skyTop);
  skyGrad.addColorStop(1, lighting.skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-140, -140, WIDTH + 280, HEIGHT + 280);

  const isDesert = scene.environment === 'desert_oasis';
  const mtnGrad = ctx.createLinearGradient(0, 120, 0, 440);
  mtnGrad.addColorStop(0, isDesert ? '#F59E0B' : '#6D93B8');
  mtnGrad.addColorStop(1, isDesert ? '#B45309' : '#3E5B7B');
  ctx.fillStyle = mtnGrad;
  ctx.beginPath();
  ctx.moveTo(-140, 480);
  ctx.lineTo(180, 130);
  ctx.lineTo(520, 320);
  ctx.lineTo(860, 110);
  ctx.lineTo(WIDTH + 140, 360);
  ctx.lineTo(WIDTH + 140, 520);
  ctx.closePath();
  ctx.fill();

  const groundGrad = ctx.createLinearGradient(0, 460, 0, HEIGHT);
  groundGrad.addColorStop(0, isDesert ? '#EAB308' : '#6C8B3E');
  groundGrad.addColorStop(1, isDesert ? '#92400E' : '#364F24');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(-140, 470, WIDTH + 280, HEIGHT - 350);

  // Subtle animated shimmer so fallback is never static
  ctx.fillStyle = lighting.sunGlow;
  ctx.beginPath();
  ctx.arc(WIDTH * 0.72 + Math.sin(timeSec * 0.3) * 12, 150, 180, 0, Math.PI * 2);
  ctx.fill();
}

export function drawAtmosphericParticles(
  ctx: CanvasRenderingContext2D,
  scene: StoryScene,
  lighting: TimeLighting,
  t: number
) {
  ctx.save();
  // Volumetric golden-hour sunbeams sweeping softly over scene
  if (
    scene.weatherEffect === 'sunbeams' ||
    scene.weatherEffect === 'sparkles' ||
    scene.timeOfDay === 'golden_hour' ||
    scene.timeOfDay === 'morning'
  ) {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const grad = ctx.createLinearGradient(80 + i * 240, 0, 360 + i * 220, HEIGHT);
      grad.addColorStop(0, `rgba(254, 240, 138, ${0.12 + Math.sin(t * 0.8 + i) * 0.03})`);
      grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(60 + i * 240, 0);
      ctx.lineTo(190 + i * 240, 0);
      ctx.lineTo(460 + i * 210, HEIGHT);
      ctx.lineTo(250 + i * 210, HEIGHT);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Drifting warm light motes / fireflies
  if (
    scene.weatherEffect === 'fireflies' ||
    scene.weatherEffect === 'sparkles' ||
    scene.weatherEffect === 'sunbeams' ||
    scene.timeOfDay === 'starlight'
  ) {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 28; i++) {
      const px = ((i * 197 + t * 20 * ((i % 3) + 1)) % (WIDTH + 40)) - 20;
      const py = 160 + ((i * 89) % 460) + Math.sin(t * 2.0 + i) * 18;
      const glow = 0.28 + Math.abs(Math.sin(t * 2.4 + i * 1.7)) * 0.55;
      const r = 2.4 + (i % 3) * 1.3;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.8);
      g.addColorStop(
        0,
        scene.weatherEffect === 'fireflies'
          ? `rgba(254, 240, 138, ${glow})`
          : `rgba(255, 247, 214, ${glow})`
      );
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (scene.weatherEffect === 'petals') {
    for (let i = 0; i < 18; i++) {
      const px = ((i * 143 + t * 38) % (WIDTH + 40)) - 20;
      const py = (i * 71 + t * 48) % (HEIGHT - 70);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t * 1.8 + i);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(244, 114, 182, 0.82)' : 'rgba(253, 186, 116, 0.85)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Subtle global color-grade bloom
  ctx.globalCompositeOperation = lighting.gradeBlend;
  ctx.fillStyle = lighting.gradeColor;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

}

export function drawTitleAndMoralOverlays(
  ctx: CanvasRenderingContext2D,
  story: GeneratedStory,
  timeSec: number,
  totalDurationSec: number
) {
  // Opening Title Card (first 3.0s)
  if (timeSec < 3.0) {
    const titleAlpha =
      timeSec < 0.6 ? timeSec / 0.6 : timeSec > 2.2 ? (3.0 - timeSec) / 0.8 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, titleAlpha));
    ctx.fillStyle = 'rgba(15, 23, 42, 0.68)';
    drawRoundedRect(ctx, WIDTH * 0.16, HEIGHT * 0.32, WIDTH * 0.68, 170, 24);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = '700 38px "Plus Jakarta Sans", "Noto Sans Tamil", sans-serif';
    ctx.fillText(story.title, WIDTH / 2, HEIGHT * 0.32 + 78, WIDTH * 0.62);

    ctx.fillStyle = '#FDE68A';
    ctx.font = '500 20px "Plus Jakarta Sans", "Noto Sans Tamil", sans-serif';
    ctx.fillText(story.bibleReference, WIDTH / 2, HEIGHT * 0.32 + 124, WIDTH * 0.6);
    ctx.restore();
  }

  // Ending Moral Lesson Card (last 3.0s)
  if (timeSec > totalDurationSec - 3.0) {
    const endAlpha = Math.min(1, (timeSec - (totalDurationSec - 3.0)) / 0.7);
    ctx.save();
    ctx.globalAlpha = endAlpha;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.74)';
    drawRoundedRect(ctx, WIDTH * 0.14, HEIGHT * 0.28, WIDTH * 0.72, 200, 24);
    ctx.fill();

    ctx.fillStyle = '#A7F3D0';
    ctx.textAlign = 'center';
    ctx.font = '600 18px "Plus Jakarta Sans", "Noto Sans Tamil", sans-serif';
    ctx.fillText('MORAL LESSON', WIDTH / 2, HEIGHT * 0.28 + 56);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 28px "Plus Jakarta Sans", "Noto Sans Tamil", sans-serif';
    ctx.fillText(story.moralLesson, WIDTH / 2, HEIGHT * 0.28 + 114, WIDTH * 0.64);

    ctx.fillStyle = '#FDE68A';
    ctx.font = '500 18px "Plus Jakarta Sans", "Noto Sans Tamil", sans-serif';
    ctx.fillText(story.bibleReference, WIDTH / 2, HEIGHT * 0.28 + 162, WIDTH * 0.62);
    ctx.restore();
  }
}

export interface ActiveSceneSlice {
  scene: StoryScene;
  sceneIdx: number;
  sceneLocalTime: number;
  sceneDuration: number;
  sceneProgress: number;
}

export function resolveActiveSceneAtTime(
  story: GeneratedStory,
  timeSec: number,
  totalDurationSec: number
): ActiveSceneSlice {
  const scenes = story.scenes;
  const clampedTime = Math.max(0, Math.min(totalDurationSec, timeSec));

  // 1. Exact audio-synced scene intervals (measured directly from per-scene TTS WAV)
  const hasExactTimings = scenes.every(
    (s) =>
      typeof s.startTimeSec === 'number' &&
      typeof s.endTimeSec === 'number' &&
      s.endTimeSec > s.startTimeSec
  );

  if (hasExactTimings) {
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      const start = s.startTimeSec as number;
      const end = i === scenes.length - 1 ? Math.max(s.endTimeSec as number, totalDurationSec) : (s.endTimeSec as number);
      if (clampedTime < end || i === scenes.length - 1) {
        const dur = Math.max(0.25, end - start);
        const local = Math.max(0, clampedTime - start);
        return {
          scene: s,
          sceneIdx: i,
          sceneLocalTime: local,
          sceneDuration: dur,
          sceneProgress: Math.max(0, Math.min(1, local / dur)),
        };
      }
    }
  }

  // 2. Proportional scene durations fallback (for initial preview or legacy projects)
  const introOffset = 1.0;
  const outroDuration = 2.4;
  const activeDuration = Math.max(10, totalDurationSec - introOffset - outroDuration);
  const weights = scenes.map((s) =>
    typeof s.duration === 'number' && s.duration > 0 ? s.duration : 10
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0) || scenes.length;

  let cursor = 0;
  for (let i = 0; i < scenes.length; i++) {
    const dur =
      i === 0
        ? introOffset + (weights[i] / totalWeight) * activeDuration
        : i === scenes.length - 1
        ? Math.max(0.5, totalDurationSec - cursor)
        : (weights[i] / totalWeight) * activeDuration;
    const end = cursor + dur;
    if (clampedTime < end || i === scenes.length - 1) {
      const local = Math.max(0, clampedTime - cursor);
      return {
        scene: scenes[i],
        sceneIdx: i,
        sceneLocalTime: local,
        sceneDuration: dur,
        sceneProgress: Math.max(0, Math.min(1, local / dur)),
      };
    }
    cursor = end;
  }

  return {
    scene: scenes[0],
    sceneIdx: 0,
    sceneLocalTime: clampedTime,
    sceneDuration: Math.max(1, totalDurationSec),
    sceneProgress: Math.max(0, Math.min(1, clampedTime / Math.max(1, totalDurationSec))),
  };
}

export function renderStoryFrame(
  ctx: CanvasRenderingContext2D,
  story: GeneratedStory,
  timeSec: number,
  totalDurationSec: number,
  speechAmp: number
) {
  const scenes = story.scenes;
  if (!scenes.length) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const { scene, sceneIdx, sceneLocalTime, sceneProgress } =
    resolveActiveSceneAtTime(story, timeSec, totalDurationSec);

  const lighting = TIME_LIGHTING[scene.timeOfDay] ?? TIME_LIGHTING.golden_hour;
  const grainPattern = getPainterlyGrainPattern(ctx);

  ctx.save();
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // Smooth cinematic camera motion
  let camScale = 1.06;
  let camX = 0;
  let camY = 0;
  const eased = easeInOut(sceneProgress);

  switch (scene.cameraMove) {
    case 'zoom_in':
      camScale = lerp(1.04, 1.14, eased);
      break;
    case 'zoom_out':
      camScale = lerp(1.14, 1.04, eased);
      break;
    case 'pan_right':
      camScale = 1.1;
      camX = lerp(38, -38, eased);
      break;
    case 'pan_left':
      camScale = 1.1;
      camX = lerp(-38, 38, eased);
      break;
    case 'crane_up':
      camScale = 1.09;
      camY = lerp(22, -16, eased);
      break;
    case 'dolly_follow':
      camScale = 1.08;
      camX = lerp(26, -26, eased);
      break;
  }

  ctx.translate(WIDTH / 2 + camX, HEIGHT / 2 + camY);
  ctx.scale(camScale, camScale);
  ctx.translate(-WIDTH / 2, -HEIGHT / 2);

  // 1. Hand-Painted Digital Concept Art Background Plate
  const backdropImg = getBackdropImage(scene.environment);
  if (backdropImg) {
    const imgRatio = backdropImg.naturalWidth / backdropImg.naturalHeight;
    const targetRatio = WIDTH / HEIGHT;
    let drawW = WIDTH * 1.04;
    let drawH = HEIGHT * 1.04;
    if (imgRatio > targetRatio) {
      drawW = drawH * imgRatio;
    } else {
      drawH = drawW / imgRatio;
    }
    const dx = (WIDTH - drawW) / 2;
    const dy = (HEIGHT - drawH) / 2;
    ctx.drawImage(backdropImg, dx, dy, drawW, drawH);
  } else {
    drawPaintedFallbackBackdrop(ctx, scene, lighting, timeSec);
  }

  // Animated water shimmer ripples for lakeside / oasis scenes
  if (scene.environment === 'waterfront' || scene.environment === 'desert_oasis') {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 251, 235, 0.36)';
    ctx.lineWidth = 2.2;
    for (let w = 0; w < 6; w++) {
      const wy = 475 + w * 22;
      const wx = ((timeSec * 24 + w * 185) % (WIDTH * 0.55)) + WIDTH * 0.34;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 24, wy - 3, wx + 48, wy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Subtle starlight shimmer for twilight / starlight scenes
  if (scene.timeOfDay === 'starlight' || scene.timeOfDay === 'twilight') {
    for (let i = 0; i < 36; i++) {
      const sx = (i * 193) % WIDTH;
      const sy = (i * 59) % 240;
      const tw = 0.25 + Math.abs(Math.sin(timeSec * 2.2 + i)) * 0.55;
      ctx.fillStyle = `rgba(255,255,255,${tw})`;
      ctx.beginPath();
      ctx.arc(sx, sy, (i % 2) + 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2. Animated Semi-Realistic Disney Storybook Characters (disabled in Image Story Mode)
  if (story.videoMode !== 'image_slideshow') {
    scene.characters.forEach((char) => {
      const canTravel =
        Math.abs(char.endX - char.startX) > 0.035 &&
        (char.action === 'walking' || char.kind === 'dove' || char.kind === 'fish');
      const travelT = canTravel
        ? easeInOut(Math.max(0, Math.min(1, (sceneProgress - 0.04) / 0.9)))
        : 0;
      const cx = lerp(char.startX * WIDTH, char.endX * WIDTH, travelT);
      const cy =
        char.kind === 'fish'
          ? 635
          : scene.environment === 'waterfront'
          ? 644
          : 648;
      drawCharacter(ctx, {
        character: char,
        x: cx,
        y: cy,
        sceneWidth: WIDTH,
        globalTime: timeSec,
        sceneProgress,
        speechAmp,
        lighting,
        grainPattern,
      });
    });
  }

  ctx.restore();

  // 3. Volumetric Sunlight, Motes, Atmospheric Color Grading & Subtle Bloom
  drawAtmosphericParticles(ctx, scene, lighting, timeSec);

  // Soft cinematic edge vignette
  const vig = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT / 2,
    WIDTH * 0.36,
    WIDTH / 2,
    HEIGHT / 2,
    WIDTH * 0.74
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(15, 23, 42, 0.22)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Scene Transition Overlay (first 0.85s of scene)
  if (sceneLocalTime < 0.85 && sceneIdx > 0) {
    const tp = sceneLocalTime / 0.85;
    ctx.save();
    if (scene.transitionIn === 'iris_open') {
      const radius = tp * WIDTH * 0.8;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.62)';
      ctx.beginPath();
      ctx.rect(0, 0, WIDTH, HEIGHT);
      ctx.arc(WIDTH / 2, HEIGHT / 2, radius, 0, Math.PI * 2, true);
      ctx.fill();
    } else if (scene.transitionIn === 'wipe_horizon') {
      ctx.fillStyle = 'rgba(109, 40, 217, 0.28)';
      ctx.fillRect(WIDTH * tp, 0, WIDTH * (1 - tp), HEIGHT);
    } else {
      ctx.fillStyle = `rgba(255, 250, 240, ${(1 - tp) * 0.38})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    ctx.restore();
  }

  drawTitleAndMoralOverlays(ctx, story, timeSec, totalDurationSec);
}

type FrameRenderCallback = (
  ctx: CanvasRenderingContext2D,
  timeSec: number,
  speechAmp: number
) => void;

async function encodeMp4WithWebCodecs(
  renderFrame: FrameRenderCallback,
  mixedAudio: AudioBuffer,
  speechTimeline: Float32Array,
  totalDurationSec: number,
  onProgress: (pct: number) => void
): Promise<Blob | null> {
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof AudioEncoder === 'undefined' ||
    typeof VideoFrame === 'undefined' ||
    typeof AudioData === 'undefined'
  ) {
    return null;
  }

  const videoConfig: VideoEncoderConfig = {
    codec: 'avc1.42001f',
    width: WIDTH,
    height: HEIGHT,
    bitrate: 3_200_000,
    framerate: FPS,
  };
  const audioConfig: AudioEncoderConfig = {
    codec: 'mp4a.40.2',
    sampleRate: mixedAudio.sampleRate,
    numberOfChannels: 2,
    bitrate: 128_000,
  };

  try {
    const vSupport = await VideoEncoder.isConfigSupported(videoConfig);
    const aSupport = await AudioEncoder.isConfigSupported(audioConfig);
    if (!vSupport.supported || !aSupport.supported) {
      return null;
    }
  } catch {
    return null;
  }

  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: WIDTH,
      height: HEIGHT,
    },
    audio: {
      codec: 'aac',
      numberOfChannels: 2,
      sampleRate: mixedAudio.sampleRate,
    },
    fastStart: 'in-memory',
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => console.error('VideoEncoder error:', err),
  });
  videoEncoder.configure(videoConfig);

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (err) => console.error('AudioEncoder error:', err),
  });
  audioEncoder.configure(audioConfig);

  const left = mixedAudio.getChannelData(0);
  const right =
    mixedAudio.numberOfChannels > 1 ? mixedAudio.getChannelData(1) : left;
  const blockFrames = 4096;
  for (let offset = 0; offset < mixedAudio.length; offset += blockFrames) {
    const count = Math.min(blockFrames, mixedAudio.length - offset);
    const planar = new Float32Array(count * 2);
    planar.set(left.subarray(offset, offset + count), 0);
    planar.set(right.subarray(offset, offset + count), count);

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: mixedAudio.sampleRate,
      numberOfFrames: count,
      numberOfChannels: 2,
      timestamp: Math.round((offset / mixedAudio.sampleRate) * 1_000_000),
      data: planar,
    });
    audioEncoder.encode(audioData);
    audioData.close();
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const totalFrames = Math.ceil(totalDurationSec * FPS);
  for (let f = 0; f < totalFrames; f++) {
    const timeSec = f / FPS;
    const amp = speechTimeline[Math.min(speechTimeline.length - 1, f)] ?? 0;

    renderFrame(ctx, timeSec, amp);

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((f / FPS) * 1_000_000),
      duration: Math.round((1 / FPS) * 1_000_000),
    });

    videoEncoder.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
    frame.close();

    if (f % 8 === 0) {
      onProgress(Math.round((f / totalFrames) * 92));
      while (videoEncoder.encodeQueueSize > 8) {
        await new Promise((r) => setTimeout(r, 4));
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await videoEncoder.flush();
  await audioEncoder.flush();
  videoEncoder.close();
  audioEncoder.close();
  muxer.finalize();
  onProgress(100);

  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

async function encodeWithMediaRecorder(
  renderFrame: FrameRenderCallback,
  mixedAudio: AudioBuffer,
  speechTimeline: Float32Array,
  totalDurationSec: number,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new AudioCtx();
  const dest = audioCtx.createMediaStreamDestination();
  const src = audioCtx.createBufferSource();
  src.buffer = mixedAudio;
  src.connect(dest);

  const canvasStream = canvas.captureStream(FPS);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const mimeCandidates = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ];
  const selectedMime =
    mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

  const recorder = selectedMime
    ? new MediaRecorder(combinedStream, {
        mimeType: selectedMime,
        videoBitsPerSecond: 3_200_000,
      })
    : new MediaRecorder(combinedStream);

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    let rafId = 0;
    const startWall = performance.now();

    recorder.onstop = async () => {
      cancelAnimationFrame(rafId);
      await audioCtx.close();
      onProgress(100);
      resolve(
        new Blob(chunks, {
          type: recorder.mimeType || selectedMime || 'video/webm',
        })
      );
    };

    recorder.onerror = async (ev) => {
      cancelAnimationFrame(rafId);
      await audioCtx.close();
      reject(ev);
    };

    recorder.start(500);
    src.start();

    const step = () => {
      const elapsed = (performance.now() - startWall) / 1000;
      if (elapsed >= totalDurationSec) {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        return;
      }
      const frameIdx = Math.min(
        speechTimeline.length - 1,
        Math.floor(elapsed * FPS)
      );
      const amp = speechTimeline[frameIdx] ?? 0;
      renderFrame(ctx, elapsed, amp);
      onProgress(Math.min(98, Math.round((elapsed / totalDurationSec) * 100)));
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
  });
}

export async function encodeCanvasVideo(
  renderFrame: FrameRenderCallback,
  mixedAudio: AudioBuffer,
  speechTimeline: Float32Array,
  totalDurationSec: number,
  onProgress: (pct: number) => void
): Promise<{ blob: Blob; mimeType: string }> {
  const mp4Blob = await encodeMp4WithWebCodecs(
    renderFrame,
    mixedAudio,
    speechTimeline,
    totalDurationSec,
    onProgress
  );
  if (mp4Blob) {
    return { blob: mp4Blob, mimeType: 'video/mp4' };
  }
  const fallbackBlob = await encodeWithMediaRecorder(
    renderFrame,
    mixedAudio,
    speechTimeline,
    totalDurationSec,
    onProgress
  );
  return {
    blob: fallbackBlob,
    mimeType: fallbackBlob.type || 'video/webm',
  };
}

export async function renderAnimatedVideo(
  story: GeneratedStory,
  mixedAudio: AudioBuffer,
  speechTimeline: Float32Array,
  totalDurationSec: number,
  onProgress: (pct: number) => void
): Promise<{ blob: Blob; mimeType: string }> {
  await preloadEnvironmentBackdrops(story.scenes);

  return encodeCanvasVideo(
    (ctx, timeSec, amp) =>
      renderStoryFrame(ctx, story, timeSec, totalDurationSec, amp),
    mixedAudio,
    speechTimeline,
    totalDurationSec,
    onProgress
  );
}
