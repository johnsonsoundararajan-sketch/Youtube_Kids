import * as Mp4Muxer from 'mp4-muxer';
import type {
  GeneratedStory,
  SceneCharacter,
  SceneEnvironment,
  StoryScene,
  TimeOfDay,
} from '../types/story';

const WIDTH = 1280;
const HEIGHT = 720;
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

function getBackdropImage(env: SceneEnvironment): HTMLImageElement | null {
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

function getPainterlyGrainPattern(
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

interface TimeLighting {
  skyTop: string;
  skyBottom: string;
  gradeColor: string;
  gradeBlend: GlobalCompositeOperation;
  rimLight: string;
  shadowTint: string;
  sunCore: string;
  sunGlow: string;
  characterTint: string;
}

const TIME_LIGHTING: Record<TimeOfDay, TimeLighting> = {
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

const INK = '#26150E';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function easeInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function adjustHex(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return hex;
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawRoundedRect(
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

function drawDisneyEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  irisColor: string,
  blink: boolean,
  lookX = 0.25
) {
  ctx.save();
  ctx.translate(x, y);

  if (blink) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-rx * 0.95, 0.5);
    ctx.quadraticCurveTo(0, ry * 0.72, rx * 0.95, 0.5);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const buildEyePath = () => {
    ctx.beginPath();
    ctx.moveTo(-rx, 0.45);
    ctx.quadraticCurveTo(-rx * 0.22, -ry * 1.18, rx, 0.12);
    ctx.quadraticCurveTo(rx * 0.14, ry * 1.08, -rx, 0.45);
    ctx.closePath();
  };

  // Multi-stop painted sclera with upper-eyelid ambient occlusion shadow
  const scleraGrad = ctx.createLinearGradient(0, -ry, 0, ry);
  scleraGrad.addColorStop(0, '#CBD5E1');
  scleraGrad.addColorStop(0.32, '#FFFFFF');
  scleraGrad.addColorStop(1, '#F8FAFC');
  ctx.fillStyle = scleraGrad;
  buildEyePath();
  ctx.fill();

  ctx.save();
  buildEyePath();
  ctx.clip();

  const ir = Math.min(rx, ry) * 0.75;
  const irisGrad = ctx.createRadialGradient(
    lookX - 0.5,
    -0.8,
    0.4,
    lookX,
    0.2,
    ir
  );
  irisGrad.addColorStop(0, adjustHex(irisColor, 46));
  irisGrad.addColorStop(0.55, irisColor);
  irisGrad.addColorStop(0.88, adjustHex(irisColor, -34));
  irisGrad.addColorStop(1, '#160B07');

  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(lookX, 0.2, ir, 0, Math.PI * 2);
  ctx.fill();

  // Deep pupil
  ctx.fillStyle = '#0D0705';
  ctx.beginPath();
  ctx.arc(lookX, 0.2, ir * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Upper eyelid soft shadow cast across top of iris
  ctx.fillStyle = 'rgba(26, 14, 10, 0.25)';
  ctx.fillRect(-rx, -ry * 1.2, rx * 2, ry * 0.58);

  // Twin Disney catchlights (crisp sun glint + warm amber bounce)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(lookX - ir * 0.36, -ir * 0.32, ir * 0.3, ir * 0.22, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(254, 240, 138, 0.68)';
  ctx.beginPath();
  ctx.arc(lookX + ir * 0.34, ir * 0.36, ir * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Sculpted dark upper lash line & soft crease
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.05;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-rx * 1.06, 0.45);
  ctx.quadraticCurveTo(-rx * 0.2, -ry * 1.2, rx * 1.06, 0.05);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(110, 56, 30, 0.45)';
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.moveTo(-rx * 0.72, -ry * 0.96);
  ctx.quadraticCurveTo(0, -ry * 1.56, rx * 0.76, -ry * 0.86);
  ctx.stroke();

  ctx.restore();
}

function drawBlushCheek(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number
) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, 'rgba(232, 106, 92, 0.32)');
  grad.addColorStop(1, 'rgba(232, 106, 92, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawPaintedFallbackBackdrop(
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

function drawStorybookHuman(
  ctx: CanvasRenderingContext2D,
  char: SceneCharacter,
  charHash: number,
  walkCycle: number,
  globalTime: number,
  mouthOpen: number,
  blink: boolean,
  lighting: TimeLighting,
  grainPattern: CanvasPattern | null
) {
  const isBoy = char.kind === 'boy';
  const isGirl = char.kind === 'girl';
  const isShepherd = char.kind === 'shepherd';
  const isAngel = char.kind === 'angel';

  const scale = isShepherd || isAngel ? 1.22 : isGirl ? 1.1 : 1.16;
  ctx.save();
  ctx.scale(scale, scale);

  const skinTones = [
    { light: '#F6CCA8', mid: '#E3A77B', shadow: '#B57349' },
    { light: '#FAD9BE', mid: '#EBB48D', shadow: '#BC7E56' },
    { light: '#EFC29A', mid: '#D99B6B', shadow: '#AA6B41' },
  ];
  const skin = skinTones[charHash % skinTones.length];

  const outfitDefaults = isGirl
    ? ['#F48B5C', '#E86C63', '#8B5CF6', '#14B8A6']
    : ['#EA580C', '#2563EB', '#0D9488', '#D97706'];
  const primaryGarment =
    char.primaryColor && char.primaryColor.startsWith('#')
      ? char.primaryColor
      : outfitDefaults[charHash % outfitDefaults.length];

  const hairPalettes = [
    { base: '#1E1922', high: '#4A3F52' },
    { base: '#2C1B14', high: '#633F2E' },
    { base: '#1A202C', high: '#414D63' },
  ];
  const hair = isAngel
    ? { base: '#5E341D', high: '#B06C40' }
    : hairPalettes[charHash % hairPalettes.length];
  const irisColor = '#4E2A16';

  const isWalking = char.action === 'walking';
  const legStride = isWalking ? walkCycle * 18 : 0;
  const armSwing = isWalking ? walkCycle * 0.34 : 0;

  // Angel layered feathered wings behind shoulders
  if (isAngel) {
    const wingFlap = Math.sin(globalTime * 5.0) * 0.14;
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(side * 10, -146);
      ctx.rotate(side * (0.28 + wingFlap));
      const wg = ctx.createLinearGradient(0, -20, side * 78, 30);
      wg.addColorStop(0, '#FFFFFF');
      wg.addColorStop(0.65, '#E0F2FE');
      wg.addColorStop(1, '#BAE6FD');
      ctx.fillStyle = wg;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.85;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * 44, -42, side * 76, -8);
      ctx.quadraticCurveTo(side * 62, 24, side * 12, 30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Feather layer lines
      ctx.strokeStyle = 'rgba(14, 116, 144, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(side * 14, 4);
      ctx.quadraticCurveTo(side * 42, -10, side * 64, -2);
      ctx.moveTo(side * 14, 14);
      ctx.quadraticCurveTo(side * 38, 6, side * 56, 12);
      ctx.stroke();
      ctx.restore();
    });
  }

  // Lush back hair for girl & angel with painted rim highlight
  if (isGirl || isAngel) {
    const hairSway = Math.sin(globalTime * 2.3 + charHash) * 2.6;
    const bhGrad = ctx.createLinearGradient(-30, -212, 28, -124);
    bhGrad.addColorStop(0, hair.base);
    bhGrad.addColorStop(0.55, hair.high);
    bhGrad.addColorStop(1, hair.base);
    ctx.fillStyle = bhGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-18, -206);
    ctx.bezierCurveTo(-36, -182, -37 + hairSway, -150, -25 + hairSway, -124);
    ctx.quadraticCurveTo(-11, -120, -2, -135);
    ctx.lineTo(15, -136);
    ctx.quadraticCurveTo(29 + hairSway * 0.6, -148, 25, -172);
    ctx.quadraticCurveTo(22, -198, 12, -210);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = lighting.rimLight;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-25, -184);
    ctx.quadraticCurveTo(-30, -160, -23, -134);
    ctx.stroke();
  }

  // Natural articulated legs & footwear
  const drawLeg = (hipX: number, strideOffset: number, isBack: boolean) => {
    const footX = hipX + strideOffset * 0.72;
    const kneeX = lerp(hipX, footX, 0.5) + 1.4;
    const kneeY = -48;

    ctx.save();
    const legGrad = ctx.createLinearGradient(hipX - 6, -96, hipX + 8, -8);
    legGrad.addColorStop(0, isBack ? skin.shadow : skin.mid);
    legGrad.addColorStop(0.5, skin.light);
    legGrad.addColorStop(1, skin.shadow);

    ctx.fillStyle = legGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.85;
    ctx.beginPath();
    ctx.moveTo(hipX - 6.5, -96);
    ctx.quadraticCurveTo(kneeX - 6, kneeY, footX - 4.2, -10);
    ctx.lineTo(footX + 4.4, -10);
    ctx.quadraticCurveTo(kneeX + 6.5, kneeY, hipX + 6.5, -96);
    ctx.closePath();
    ctx.fill();

    // Ambient occlusion shadow just under shorts/tunic hem
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(42, 22, 12, 0.25)';
    ctx.fillRect(hipX - 10, -98, 20, 18);
    ctx.restore();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(130, 74, 42, 0.42)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(kneeX, kneeY + 1, 3.2, 0.2, Math.PI - 0.2);
    ctx.stroke();

    if (isGirl) {
      const shoeGrad = ctx.createLinearGradient(footX - 6, -10, footX + 12, 0);
      shoeGrad.addColorStop(0, '#BEF264');
      shoeGrad.addColorStop(1, '#65A30D');
      ctx.fillStyle = shoeGrad;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.85;
      ctx.beginPath();
      ctx.moveTo(footX - 6, -10);
      ctx.lineTo(footX + 12, -8);
      ctx.quadraticCurveTo(footX + 16, -2, footX + 12, 0);
      ctx.lineTo(footX - 7, 0);
      ctx.quadraticCurveTo(footX - 9, -5, footX - 6, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#52372A';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(footX + 3, -2, 10.5, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isAngel ? '#FDE047' : '#8D5E3C';
      ctx.beginPath();
      ctx.moveTo(footX - 4, -8);
      ctx.quadraticCurveTo(footX + 4, -5, footX + 10, -3);
      ctx.lineTo(footX + 6, -1);
      ctx.quadraticCurveTo(footX + 1, -4, footX - 5, -5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  };

  drawLeg(-9, -legStride, true);
  drawLeg(9, legStride, false);

  // Lower garment with realistic shaded folds & painterly grain
  if (isGirl) {
    const shortGrad = ctx.createLinearGradient(-16, -120, 16, -84);
    shortGrad.addColorStop(0, '#3D4C63');
    shortGrad.addColorStop(0.65, '#1E293B');
    shortGrad.addColorStop(1, '#0F172A');
    ctx.fillStyle = shortGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-15, -120);
    ctx.lineTo(15, -120);
    ctx.lineTo(18, -86);
    ctx.lineTo(2, -85);
    ctx.lineTo(0, -98);
    ctx.lineTo(-2, -85);
    ctx.lineTo(-18, -86);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (isBoy) {
    const cargoGrad = ctx.createLinearGradient(-18, -120, 18, -76);
    cargoGrad.addColorStop(0, '#446DA3');
    cargoGrad.addColorStop(0.55, '#294975');
    cargoGrad.addColorStop(1, '#172C4A');
    ctx.fillStyle = cargoGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-18, -120);
    ctx.lineTo(18, -120);
    ctx.lineTo(21, -76);
    ctx.lineTo(3, -75);
    ctx.lineTo(0, -95);
    ctx.lineTo(-3, -75);
    ctx.lineTo(-21, -76);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Double-toned pocket flap & drawstring folds
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(-18, -98, 9, 13);
    ctx.strokeRect(9, -98, 9, 13);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.moveTo(-17, -99);
    ctx.lineTo(-9, -99);
    ctx.moveTo(9, -99);
    ctx.lineTo(17, -99);
    ctx.stroke();
  } else {
    const tunicColor = isAngel ? '#F8FAFC' : adjustHex(primaryGarment, -12);
    const tGrad = ctx.createLinearGradient(-20, -120, 20, -32);
    tGrad.addColorStop(0, adjustHex(tunicColor, 26));
    tGrad.addColorStop(0.55, tunicColor);
    tGrad.addColorStop(1, adjustHex(tunicColor, -34));
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-17, -120);
    ctx.lineTo(17, -120);
    ctx.quadraticCurveTo(23, -76, 25, -36);
    ctx.quadraticCurveTo(0, -30, -25, -36);
    ctx.quadraticCurveTo(-23, -76, -17, -120);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Shadow + highlight cloth drapery folds
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-8, -112);
    ctx.quadraticCurveTo(-11, -75, -13, -40);
    ctx.moveTo(7, -112);
    ctx.quadraticCurveTo(10, -75, 11, -40);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-6, -112);
    ctx.quadraticCurveTo(-9, -75, -11, -40);
    ctx.stroke();
  }

  // Torso with soft directional lighting, gouache grain & detailed garment folds
  const shoulderW = isGirl ? 17 : 21;
  if (isGirl) {
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.85;
    ctx.beginPath();
    ctx.moveTo(-12, -172);
    ctx.lineTo(12, -172);
    ctx.lineTo(14, -118);
    ctx.lineTo(-14, -118);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const hoodGrad = ctx.createLinearGradient(-20, -174, 20, -116);
    hoodGrad.addColorStop(0, adjustHex(primaryGarment, 34));
    hoodGrad.addColorStop(0.55, primaryGarment);
    hoodGrad.addColorStop(1, adjustHex(primaryGarment, -34));
    ctx.fillStyle = hoodGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;

    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(side * 8, -173);
      ctx.lineTo(side * shoulderW, -168);
      ctx.quadraticCurveTo(side * 20, -142, side * 17, -116);
      ctx.lineTo(side * 5, -116);
      ctx.lineTo(side * 6, -165);
      ctx.closePath();
      ctx.fill();
      if (grainPattern) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = grainPattern;
        ctx.fillRect(-25, -176, 50, 65);
        ctx.restore();
      }
      ctx.stroke();
    });

    // Pocket & lapel fold pairs (shadow + warm rim highlight)
    ctx.strokeStyle = 'rgba(34, 20, 14, 0.35)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-15, -129);
    ctx.lineTo(-7, -126);
    ctx.moveTo(15, -129);
    ctx.lineTo(7, -126);
    ctx.stroke();
  } else {
    const topColor = isAngel ? '#F8FAFC' : primaryGarment;
    const topGrad = ctx.createLinearGradient(-22, -174, 22, -116);
    topGrad.addColorStop(0, adjustHex(topColor, 34));
    topGrad.addColorStop(0.55, topColor);
    topGrad.addColorStop(1, adjustHex(topColor, -36));

    ctx.fillStyle = topGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-14, -174);
    ctx.lineTo(14, -174);
    ctx.lineTo(shoulderW, -167);
    ctx.quadraticCurveTo(21, -142, 18, -116);
    ctx.quadraticCurveTo(0, -113, -18, -116);
    ctx.quadraticCurveTo(-21, -142, -shoulderW, -167);
    ctx.closePath();
    ctx.fill();

    if (grainPattern) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = grainPattern;
      ctx.fillRect(-26, -176, 52, 65);
      // Warm golden-hour rim light on left sunlit shoulder
      ctx.strokeStyle = lighting.rimLight;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-shoulderW + 1, -167);
      ctx.quadraticCurveTo(-20, -142, -17, -116);
      ctx.stroke();
      ctx.restore();
    }
    ctx.stroke();

    // Ribbed hem & collar
    ctx.strokeStyle = adjustHex(topColor, -42);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-17, -119);
    ctx.lineTo(17, -119);
    ctx.stroke();

    // Soft double-line waist folds (shadow + highlight)
    ctx.strokeStyle = 'rgba(34, 20, 14, 0.25)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-11, -132);
    ctx.quadraticCurveTo(-2, -128, 7, -131);
    ctx.moveTo(-8, -124);
    ctx.quadraticCurveTo(2, -122, 11, -125);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.moveTo(-10, -133.5);
    ctx.quadraticCurveTo(-2, -129.5, 7, -132.5);
    ctx.stroke();

    if (isShepherd) {
      const sashGrad = ctx.createLinearGradient(-15, -174, 18, -118);
      sashGrad.addColorStop(0, '#B45309');
      sashGrad.addColorStop(1, '#78350F');
      ctx.fillStyle = sashGrad;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-15, -174);
      ctx.lineTo(-5, -174);
      ctx.lineTo(18, -118);
      ctx.lineTo(9, -117);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Articulated arms with sleeve folds
  const drawArm = (
    sx: number,
    sy: number,
    upperAngle: number,
    forearmAngle: number,
    sleeveColor: string
  ) => {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(upperAngle);

    const sg = ctx.createLinearGradient(-5.5, 0, 5.5, 28);
    sg.addColorStop(0, adjustHex(sleeveColor, 20));
    sg.addColorStop(1, adjustHex(sleeveColor, -22));
    ctx.fillStyle = sg;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.85;
    drawRoundedRect(ctx, -5.5, -2, 11, 29, 5);
    ctx.fill();
    ctx.stroke();

    ctx.translate(0, 25);
    ctx.rotate(forearmAngle);
    ctx.fillStyle = adjustHex(sleeveColor, -10);
    drawRoundedRect(ctx, -5, -2, 10, 24, 4.5);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(34, 20, 14, 0.35)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-4, 2);
    ctx.lineTo(4, 0);
    ctx.stroke();

    ctx.fillStyle = skin.light;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.ellipse(0, 25, 4.6, 5.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  };

  const sleeveBase = isGirl
    ? primaryGarment
    : isAngel
    ? '#F8FAFC'
    : primaryGarment;

  drawArm(-shoulderW + 2, -166, 0.14 - armSwing, -0.22, adjustHex(sleeveBase, -18));

  const frontUpper =
    char.action === 'waving' || char.action === 'celebrating'
      ? -2.35 + Math.sin(globalTime * 7.5) * 0.35
      : char.action === 'praying'
      ? -0.65
      : -0.14 + armSwing;
  const frontFore =
    char.action === 'waving' || char.action === 'celebrating'
      ? -0.45
      : char.action === 'praying'
      ? -1.1
      : -0.3;
  drawArm(shoulderW - 2, -166, frontUpper, frontFore, sleeveBase);

  if (isShepherd) {
    ctx.strokeStyle = '#6B3F1D';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(26, -182);
    ctx.arc(35, -182, 9, Math.PI, 0);
    ctx.stroke();
  }

  // Sculpted neck with chin ambient occlusion
  ctx.fillStyle = skin.mid;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-6, -186);
  ctx.lineTo(6, -186);
  ctx.lineTo(6.5, -172);
  ctx.quadraticCurveTo(0, -169, -6.5, -172);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = skin.shadow;
  ctx.beginPath();
  ctx.ellipse(0, -181, 5.6, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();

  [-15, 15].forEach((ex) => {
    ctx.fillStyle = skin.mid;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.ellipse(ex, -198, 3.6, 5.8, ex < 0 ? -0.15 : 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Softly shaded Disney-storybook sculpted face
  const faceGrad = ctx.createRadialGradient(-4, -204, 3, 0, -197, 23);
  faceGrad.addColorStop(0, skin.light);
  faceGrad.addColorStop(0.68, skin.mid);
  faceGrad.addColorStop(1, skin.shadow);
  ctx.fillStyle = faceGrad;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(-14.5, -206);
  ctx.quadraticCurveTo(-15.5, -192, -9.5, -184);
  ctx.quadraticCurveTo(0, -177, 9.5, -184);
  ctx.quadraticCurveTo(15.5, -192, 14.5, -206);
  ctx.quadraticCurveTo(14, -220, 0, -220);
  ctx.quadraticCurveTo(-14, -220, -14.5, -206);
  ctx.closePath();
  ctx.fill();

  if (grainPattern) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = grainPattern;
    ctx.fillRect(-18, -224, 36, 50);
    ctx.restore();
  }
  ctx.stroke();

  if (isShepherd) {
    ctx.fillStyle = hair.base;
    ctx.globalAlpha = 0.86;
    ctx.beginPath();
    ctx.moveTo(-13.5, -195);
    ctx.quadraticCurveTo(-11, -182, 0, -178);
    ctx.quadraticCurveTo(11, -182, 13.5, -195);
    ctx.quadraticCurveTo(10, -187, 0, -186);
    ctx.quadraticCurveTo(-10, -187, -13.5, -195);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawBlushCheek(ctx, -8.5, -194, 4.6);
  drawBlushCheek(ctx, 9.5, -194, 4.6);

  drawDisneyEye(ctx, -5.6, -200, 4.5, 3.4, irisColor, blink, 0.35);
  drawDisneyEye(ctx, 6.4, -200, 4.5, 3.4, irisColor, blink, 0.35);

  const browLift =
    char.mood === 'amazed' || char.mood === 'joyful'
      ? -1.8
      : char.mood === 'curious'
      ? -1.2
      : 0;
  ctx.strokeStyle = hair.base;
  ctx.lineWidth = isGirl ? 2.0 : 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-9.8, -205.5 + browLift);
  ctx.quadraticCurveTo(-5.5, -207.8 + browLift, -1.5, -205.2 + browLift);
  ctx.moveTo(2.4, -205.2 + browLift);
  ctx.quadraticCurveTo(6.6, -207.8 + browLift, 10.6, -205.5 + browLift);
  ctx.stroke();

  ctx.strokeStyle = skin.shadow;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(1.2, -199);
  ctx.quadraticCurveTo(3.0, -194, 1.0, -192.5);
  ctx.stroke();

  if (mouthOpen > 0.22) {
    ctx.fillStyle = '#7F1D1D';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0.8, -187.2, 4.8, 1.6 + mouthOpen * 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(-2.2, -188.6, 6, 1.4);
  } else {
    ctx.strokeStyle = '#7C2D12';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-4.2, -188);
    ctx.quadraticCurveTo(0.8, -185.2, 5.4, -188.2);
    ctx.stroke();
  }

  // Voluminous front hair with painterly highlight
  const fhGrad = ctx.createRadialGradient(-4, -218, 2, 0, -210, 22);
  fhGrad.addColorStop(0, hair.high);
  fhGrad.addColorStop(1, hair.base);
  ctx.fillStyle = fhGrad;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.9;

  if (isGirl || isAngel) {
    ctx.beginPath();
    ctx.moveTo(-15.5, -198);
    ctx.quadraticCurveTo(-18, -216, -2, -224);
    ctx.quadraticCurveTo(16, -223, 17, -198);
    ctx.quadraticCurveTo(13, -210, 4, -213);
    ctx.quadraticCurveTo(-4, -211, -15.5, -198);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-14.8, -199);
    ctx.quadraticCurveTo(-17.5, -214, -11, -221);
    ctx.quadraticCurveTo(-2, -231, 13, -224);
    ctx.quadraticCurveTo(19, -218, 15, -199);
    ctx.quadraticCurveTo(12, -210, 1, -212);
    ctx.quadraticCurveTo(-9, -211, -14.8, -199);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-6, -221);
    ctx.quadraticCurveTo(4, -224, 12, -216);
    ctx.stroke();
  }

  if (isAngel) {
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2.8;
    ctx.shadowColor = 'rgba(250, 204, 21, 0.85)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(0, -234, 14, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Subtle atmospheric lighting tint unifying character into scene lighting
  ctx.fillStyle = lighting.characterTint;
  ctx.fillRect(-35, -245, 70, 250);

  ctx.restore();
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  char: SceneCharacter,
  x: number,
  y: number,
  globalTime: number,
  sceneProgress: number,
  speechAmp: number,
  lighting: TimeLighting,
  grainPattern: CanvasPattern | null
) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const charHash = hashString(char.name || char.kind);
  const isWalking = char.action === 'walking';
  const walkCycle = isWalking ? Math.sin(globalTime * 6.8 + charHash) : 0;
  const idleBreathe = Math.sin(globalTime * 2.4 + charHash) * 1.4;

  const jumpOffset =
    char.action === 'jumping' || char.action === 'celebrating'
      ? Math.abs(Math.sin(globalTime * 5.8 + charHash)) * -24
      : char.action === 'flying'
      ? Math.sin(globalTime * 4.0 + charHash) * 14 - 88
      : char.action === 'swimming'
      ? Math.sin(globalTime * 3.6 + charHash) * 6
      : 0;

  const bob = Math.abs(walkCycle) * -4 + jumpOffset + idleBreathe;
  const facingRight = char.endX >= char.startX;
  const dir = facingRight ? 1 : -1;

  ctx.translate(x, y + bob);

  // Multi-layered ambient occlusion contact shadow + soft sun penumbra
  ctx.save();
  ctx.translate(0, -bob + 3);
  const shadowScale = Math.max(0.55, 1 + bob / 140);
  ctx.fillStyle = 'rgba(18, 14, 12, 0.18)';
  ctx.beginPath();
  ctx.ellipse(8, 2, 36 * shadowScale, 11 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(18, 14, 12, 0.34)';
  ctx.beginPath();
  ctx.ellipse(2, 0, 22 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.scale(dir, 1);

  const isAnimal =
    char.kind === 'lamb' ||
    char.kind === 'dove' ||
    char.kind === 'lion' ||
    char.kind === 'fish' ||
    char.kind === 'donkey';

  const blink = Math.sin(globalTime * 1.55 + (charHash % 17)) > 0.968;
  const mouthOpen = Math.min(1, speechAmp * 1.5);

  if (char.kind === 'lamb') {
    ctx.save();
    ctx.scale(1.16, 1.16);
    const legSwing = walkCycle * 10;
    [
      [-16, -legSwing],
      [12, legSwing],
    ].forEach(([lx, swing]) => {
      ctx.strokeStyle = '#8F634E';
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(lx, -22);
      ctx.lineTo(lx + swing * 0.45, -2);
      ctx.stroke();
      ctx.fillStyle = '#3B1E12';
      ctx.beginPath();
      ctx.ellipse(lx + swing * 0.45 + 1, 0, 4.2, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    const woolGrad = ctx.createRadialGradient(-4, -48, 6, 0, -34, 40);
    woolGrad.addColorStop(0, '#FFFFFF');
    woolGrad.addColorStop(0.68, '#F1F5F9');
    woolGrad.addColorStop(1, '#CBD5E1');
    ctx.fillStyle = woolGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(-18, -36, 17, 0, Math.PI * 2);
    ctx.arc(0, -42, 23, 0, Math.PI * 2);
    ctx.arc(18, -36, 18, 0, Math.PI * 2);
    ctx.arc(-4, -26, 18, 0, Math.PI * 2);
    ctx.arc(12, -26, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    [
      [-8, legSwing],
      [20, -legSwing],
    ].forEach(([lx, swing]) => {
      ctx.strokeStyle = '#B88469';
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(lx, -22);
      ctx.lineTo(lx + swing * 0.45, -2);
      ctx.stroke();
      ctx.fillStyle = '#3B1E12';
      ctx.beginPath();
      ctx.ellipse(lx + swing * 0.45 + 1, 0, 4.2, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ribbon collar + golden bell
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(16, -34);
    ctx.lineTo(28, -30);
    ctx.stroke();
    ctx.fillStyle = '#FACC15';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(26, -26, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const headGrad = ctx.createRadialGradient(28, -56, 4, 30, -50, 20);
    headGrad.addColorStop(0, '#FAD6B8');
    headGrad.addColorStop(1, '#DDA274');
    ctx.fillStyle = headGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.ellipse(30, -50, 17, 14.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(25, -62, 8.5, 0, Math.PI * 2);
    ctx.arc(34, -61, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    drawBlushCheek(ctx, 37, -45, 5);
    drawDisneyEye(ctx, 35, -52, 4.6, 3.6, '#4A2816', blink, 0.5);

    ctx.fillStyle = '#E11D48';
    ctx.beginPath();
    ctx.ellipse(44, -47, 2.3, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(39, -43, 4 + mouthOpen * 1.4, 0.1, Math.PI - 0.1);
    ctx.stroke();
    ctx.restore();
  } else if (char.kind === 'dove') {
    ctx.save();
    ctx.scale(1.15, 1.15);
    const flap = Math.sin(globalTime * 12 + charHash) * 18;
    const bodyGrad = ctx.createRadialGradient(0, -34, 4, 0, -28, 28);
    bodyGrad.addColorStop(0, '#FFFFFF');
    bodyGrad.addColorStop(1, '#DCEEFB');

    ctx.fillStyle = '#BAE6FD';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-4, -34);
    ctx.quadraticCurveTo(-18, -60 + flap * 0.7, 8, -42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, -28, 22, 13, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(19, -38, 11.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-6, -30);
    ctx.quadraticCurveTo(-20, -62 - flap, 12, -38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.moveTo(29, -40);
    ctx.lineTo(38, -37);
    ctx.lineTo(29, -34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#15803D';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(33, -36);
    ctx.quadraticCurveTo(43, -32, 47, -38);
    ctx.stroke();

    drawDisneyEye(ctx, 22, -40, 3.6, 2.8, '#4A2816', blink, 0.4);
    ctx.restore();
  } else if (char.kind === 'fish') {
    ctx.save();
    ctx.scale(1.15, 1.15);
    const tail = Math.sin(globalTime * 8 + charHash) * 8;
    const fishColor = char.primaryColor || '#38BDF8';
    const bodyGrad = ctx.createRadialGradient(4, -32, 4, 0, -28, 32);
    bodyGrad.addColorStop(0, adjustHex(fishColor, 50));
    bodyGrad.addColorStop(1, adjustHex(fishColor, -28));

    ctx.fillStyle = adjustHex(fishColor, 26);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-24, -28);
    ctx.quadraticCurveTo(-44, -46 + tail, -46, -28 + tail * 0.4);
    ctx.quadraticCurveTo(-44, -10 + tail, -24, -28);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, -28, 29, 17.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    drawDisneyEye(ctx, 14, -31, 4.4, 3.4, '#1E293B', blink, 0.4);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(21, -24, 3.8, 0.2, Math.PI * 0.85);
    ctx.stroke();
    ctx.restore();
  } else if (char.kind === 'lion' || char.kind === 'donkey') {
    ctx.save();
    ctx.scale(1.18, 1.18);
    const isLion = char.kind === 'lion';
    const legSwing = walkCycle * 10;
    const coatMain = isLion ? '#E59528' : '#8A94A3';
    const coatLight = isLion ? '#FCD581' : '#CBD5E1';

    [
      [-18, -legSwing],
      [-6, legSwing],
      [10, -legSwing],
      [22, legSwing],
    ].forEach(([lx, swing]) => {
      ctx.strokeStyle = coatMain;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(lx, -26);
      ctx.lineTo(lx + swing * 0.45, -2);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(lx + swing * 0.45 + 1, 0, 4.8, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    const bodyGrad = ctx.createRadialGradient(0, -44, 6, 0, -38, 34);
    bodyGrad.addColorStop(0, coatLight);
    bodyGrad.addColorStop(1, coatMain);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.ellipse(0, -38, 32, 18.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isLion) {
      const maneGrad = ctx.createRadialGradient(28, -56, 6, 28, -54, 28);
      maneGrad.addColorStop(0, '#B45309');
      maneGrad.addColorStop(1, '#78350F');
      ctx.fillStyle = maneGrad;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI * 2) / 10;
        ctx.arc(28 + Math.cos(a) * 17, -54 + Math.sin(a) * 17, 9.5, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = coatMain;
      ctx.beginPath();
      ctx.ellipse(20, -75, 5, 15, -0.22, 0, Math.PI * 2);
      ctx.ellipse(31, -75, 5, 15, 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const headGrad = ctx.createRadialGradient(28, -58, 4, 29, -54, 18);
    headGrad.addColorStop(0, coatLight);
    headGrad.addColorStop(1, coatMain);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(29, -54, 16.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.ellipse(36, -48, 9.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    drawDisneyEye(ctx, 32, -57, 4.2, 3.2, '#4A2816', blink, 0.4);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(41, -50, 3.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    drawStorybookHuman(
      ctx,
      char,
      charHash,
      walkCycle,
      globalTime,
      mouthOpen,
      blink,
      lighting,
      grainPattern
    );
  }

  ctx.restore();

  if (sceneProgress < 0.28 && !isAnimal) {
    const labelAlpha = Math.sin((sceneProgress / 0.28) * Math.PI);
    ctx.save();
    ctx.globalAlpha = labelAlpha * 0.92;
    ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(15, 23, 42, 0.9)';
    ctx.shadowBlur = 7;
    ctx.fillText(char.name, x, y + 26);
    ctx.restore();
  }
}

function drawAtmosphericParticles(
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

  ctx.restore();
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

  const introOffset = 1.0;
  const outroDuration = 2.4;
  const activeDuration = Math.max(10, totalDurationSec - introOffset - outroDuration);
  const sceneDur = activeDuration / scenes.length;
  const storyTime = Math.max(0, timeSec - introOffset);
  const sceneIdx = Math.min(scenes.length - 1, Math.floor(storyTime / sceneDur));
  const scene = scenes[sceneIdx];
  const sceneLocalTime = storyTime - sceneIdx * sceneDur;
  const sceneProgress = Math.max(0, Math.min(1, sceneLocalTime / sceneDur));

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

  // 2. Animated Semi-Realistic Disney Storybook Characters
  scene.characters.forEach((char) => {
    const cx = lerp(char.startX * WIDTH, char.endX * WIDTH, eased);
    const cy =
      char.kind === 'fish'
        ? 635
        : scene.environment === 'waterfront'
        ? 644
        : 648;
    drawCharacter(
      ctx,
      char,
      cx,
      cy,
      timeSec,
      sceneProgress,
      speechAmp,
      lighting,
      grainPattern
    );
  });

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

async function encodeMp4WithWebCodecs(
  story: GeneratedStory,
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

    renderStoryFrame(ctx, story, timeSec, totalDurationSec, amp);

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
  story: GeneratedStory,
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
      renderStoryFrame(ctx, story, elapsed, totalDurationSec, amp);
      onProgress(Math.min(98, Math.round((elapsed / totalDurationSec) * 100)));
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
  });
}

export async function renderAnimatedVideo(
  story: GeneratedStory,
  mixedAudio: AudioBuffer,
  speechTimeline: Float32Array,
  totalDurationSec: number,
  onProgress: (pct: number) => void
): Promise<{ blob: Blob; mimeType: string }> {
  await preloadEnvironmentBackdrops(story.scenes);

  const mp4Blob = await encodeMp4WithWebCodecs(
    story,
    mixedAudio,
    speechTimeline,
    totalDurationSec,
    onProgress
  );
  if (mp4Blob) {
    return { blob: mp4Blob, mimeType: 'video/mp4' };
  }
  const fallbackBlob = await encodeWithMediaRecorder(
    story,
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
