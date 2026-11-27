import type { SceneCharacter } from '../types/story';

export interface TimeLighting {
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

export interface CharacterRenderSpec {
  character: SceneCharacter;
  x: number;
  y: number;
  sceneWidth?: number;
  globalTime: number;
  sceneProgress: number;
  speechAmp: number;
  lighting: TimeLighting;
  grainPattern: CanvasPattern | null;
}

const INK = '#26150E';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const NAMED_STORY_COLORS: Record<string, string> = {
  silver_blue: '#93C5FD',
  sky_blue: '#38BDF8',
  light_blue: '#60A5FA',
  royal_blue: '#2563EB',
  navy_blue: '#1E3A8A',
  ocean_blue: '#0284C7',
  deep_blue: '#1D4ED8',
  blue: '#3B82F6',
  golden_yellow: '#F59E0B',
  gold: '#F59E0B',
  amber: '#D97706',
  warm_yellow: '#FACC15',
  yellow: '#FACC15',
  warm_brown: '#92400E',
  brown: '#92400E',
  tan: '#D97706',
  cream: '#FEF3C7',
  ivory: '#FFFBEB',
  white: '#F8FAFC',
  silver: '#CBD5E1',
  gray: '#94A3B8',
  grey: '#94A3B8',
  slate: '#64748B',
  forest_green: '#16A34A',
  emerald: '#10B981',
  olive: '#65A30D',
  sage: '#84CC16',
  green: '#22C55E',
  teal: '#0D9488',
  turquoise: '#14B8A6',
  crimson: '#DC2626',
  red: '#EF4444',
  coral: '#FB7185',
  rose: '#F43F5E',
  pink: '#EC4899',
  orange: '#EA580C',
  peach: '#FB923C',
  purple: '#8B5CF6',
  violet: '#7C3AED',
  lavender: '#A78BFA',
  indigo: '#4F46E5',
};

let colorProbeCtx: CanvasRenderingContext2D | null = null;

function normalizeCanvasColor(
  rawColor: string | undefined,
  fallback = '#3B82F6'
): string {
  if (!rawColor || typeof rawColor !== 'string') return fallback;
  const trimmed = rawColor.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  const key = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  if (NAMED_STORY_COLORS[key]) {
    return NAMED_STORY_COLORS[key];
  }

  // Fallback CSS color probe (e.g. "cornflowerblue", "goldenrod")
  if (typeof document !== 'undefined') {
    if (!colorProbeCtx) {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      colorProbeCtx = c.getContext('2d');
    }
    if (colorProbeCtx) {
      colorProbeCtx.fillStyle = '#010203';
      colorProbeCtx.fillStyle = trimmed.toLowerCase();
      const resolved = colorProbeCtx.fillStyle;
      if (typeof resolved === 'string' && /^#[0-9a-fA-F]{6}$/.test(resolved) && resolved !== '#010203') {
        return resolved;
      }
    }
  }

  // Fuzzy keyword match on compound names like "bright_silver_blue"
  for (const [k, hex] of Object.entries(NAMED_STORY_COLORS)) {
    if (key.includes(k)) return hex;
  }

  return fallback;
}

function adjustHex(hex: string, amount: number): string {
  const safeHex = normalizeCanvasColor(hex, '#64748B');
  const clean = safeHex.replace('#', '');
  if (clean.length !== 6) return safeHex;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return safeHex;
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Traces a continuous smooth scalloped oval curve (zero overlapping interior circles).
 */
function traceScallopedLoop(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  lobes: number,
  puffDepth: number
) {
  ctx.beginPath();
  for (let i = 0; i < lobes; i++) {
    const a0 = (i * Math.PI * 2) / lobes;
    const a1 = ((i + 1) * Math.PI * 2) / lobes;
    const amid = (a0 + a1) / 2;

    const x0 = cx + Math.cos(a0) * rx;
    const y0 = cy + Math.sin(a0) * ry;
    const cpx = cx + Math.cos(amid) * (rx + puffDepth);
    const cpy = cy + Math.sin(amid) * (ry + puffDepth);
    const x1 = cx + Math.cos(a1) * rx;
    const y1 = cy + Math.sin(a1) * ry;

    if (i === 0) ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cpx, cpy, x1, y1);
  }
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

  ctx.fillStyle = '#0D0705';
  ctx.beginPath();
  ctx.arc(lookX, 0.2, ir * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(26, 14, 10, 0.25)';
  ctx.fillRect(-rx, -ry * 1.2, rx * 2, ry * 0.58);

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(lookX - ir * 0.36, -ir * 0.32, ir * 0.3, ir * 0.22, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(254, 240, 138, 0.68)';
  ctx.beginPath();
  ctx.arc(lookX + ir * 0.34, ir * 0.36, ir * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

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

interface CharacterPoseContext {
  char: SceneCharacter;
  charHash: number;
  globalTime: number;
  sceneProgress: number;
  speechAmp: number;
  isMovingAcross: boolean;
  isActuallyWalking: boolean;
  walkCycle: number;
  groundOffset: number;
  yOffset: number;
  dir: number;
  blink: boolean;
  mouthOpen: number;
  isListening: boolean;
  talkEnergy: number;
  breathLift: number;
  headTilt: number;
  lighting: TimeLighting;
  grainPattern: CanvasPattern | null;
}

interface HumanStylePalette {
  isBoy: boolean;
  isGirl: boolean;
  isShepherd: boolean;
  isAngel: boolean;
  scale: number;
  shoulderW: number;
  skin: { light: string; mid: string; shadow: string };
  primaryGarment: string;
  sleeveBase: string;
  hair: { base: string; high: string };
  irisColor: string;
  legStride: number;
  armSwing: number;
  backUpper: number;
  backFore: number;
  frontUpper: number;
  frontFore: number;
}

function buildHumanStylePalette(p: CharacterPoseContext): HumanStylePalette {
  const { char, charHash, isActuallyWalking, walkCycle, isListening, sceneProgress, globalTime, talkEnergy } = p;
  const isBoy = char.kind === 'boy';
  const isGirl = char.kind === 'girl';
  const isShepherd = char.kind === 'shepherd';
  const isAngel = char.kind === 'angel';
  const scale = isShepherd || isAngel ? 1.22 : isGirl ? 1.1 : 1.16;
  const shoulderW = isGirl ? 17 : 21;

  const skinTones = [
    { light: '#F6CCA8', mid: '#E3A77B', shadow: '#B57349' },
    { light: '#FAD9BE', mid: '#EBB48D', shadow: '#BC7E56' },
    { light: '#EFC29A', mid: '#D99B6B', shadow: '#AA6B41' },
  ];
  const skin = skinTones[charHash % skinTones.length];

  const outfitDefaults = isGirl
    ? ['#F48B5C', '#E86C63', '#8B5CF6', '#14B8A6']
    : ['#EA580C', '#2563EB', '#0D9488', '#D97706'];
  const primaryGarment = normalizeCanvasColor(
    char.primaryColor,
    outfitDefaults[charHash % outfitDefaults.length]
  );

  const hairPalettes = [
    { base: '#1E1922', high: '#4A3F52' },
    { base: '#2C1B14', high: '#633F2E' },
    { base: '#1A202C', high: '#414D63' },
  ];
  const hair = isAngel
    ? { base: '#5E341D', high: '#B06C40' }
    : hairPalettes[charHash % hairPalettes.length];

  const sleeveBase = isGirl || !isAngel ? primaryGarment : '#F8FAFC';
  const legStride = isActuallyWalking ? walkCycle * 16 : 0;
  const armSwing = isActuallyWalking ? walkCycle * 0.22 : 0;

  let backUpper = 0.06 - armSwing;
  let backFore = -0.14;
  let frontUpper = -0.06 + armSwing;
  let frontFore = -0.16;

  if (char.action === 'praying') {
    backUpper = -0.52;
    backFore = -1.0;
    frontUpper = -0.58;
    frontFore = -1.05;
  } else if (isListening) {
    backUpper = 0.05;
    backFore = -0.12;
    frontUpper = -0.05;
    frontFore = -0.14;
  } else if (!isActuallyWalking) {
    if (char.action === 'waving') {
      const waveBlend =
        sceneProgress < 0.08
          ? sceneProgress / 0.08
          : sceneProgress < 0.24
          ? 1
          : sceneProgress < 0.36
          ? (0.36 - sceneProgress) / 0.12
          : 0;
      const talkMove = Math.sin(globalTime * 2.8 + charHash) * 0.06 * talkEnergy;
      frontUpper = lerp(-0.08, -1.65, waveBlend) + talkMove;
      frontFore = lerp(-0.18, -0.55 + Math.sin(globalTime * 3.5) * 0.12, waveBlend);
    } else if (char.action === 'celebrating') {
      const talkMove = Math.sin(globalTime * 2.6 + charHash) * 0.06 * talkEnergy;
      frontUpper = -0.28 - talkEnergy * 0.16 + talkMove;
      frontFore = -0.45 - talkEnergy * 0.18;
    } else {
      const speakWave = Math.sin(globalTime * 2.9 + charHash) * 0.07 * talkEnergy;
      frontUpper = -0.06 - talkEnergy * 0.2 + speakWave;
      frontFore = -0.16 - talkEnergy * 0.34 - Math.abs(speakWave) * 0.3;
      backUpper = 0.05 + talkEnergy * 0.05;
      backFore = -0.14 - talkEnergy * 0.12;
    }
  }

  return {
    isBoy,
    isGirl,
    isShepherd,
    isAngel,
    scale,
    shoulderW,
    skin,
    primaryGarment,
    sleeveBase,
    hair,
    irisColor: '#4E2A16',
    legStride,
    armSwing,
    backUpper,
    backFore,
    frontUpper,
    frontFore,
  };
}

// =========================================================================
// LAYER 1: GROUNDED CONTACT SHADOW
// =========================================================================
function drawCharacterShadow(
  ctx: CanvasRenderingContext2D,
  yOffset: number,
  groundOffset: number,
  isQuadruped: boolean
) {
  ctx.save();
  ctx.translate(0, -yOffset + 3);
  const shadowScale = Math.max(0.55, 1 + groundOffset / 150);
  const rxOuter = (isQuadruped ? 44 : 36) * shadowScale;
  const rxInner = (isQuadruped ? 28 : 22) * shadowScale;

  ctx.fillStyle = 'rgba(18, 14, 12, 0.18)';
  ctx.beginPath();
  ctx.ellipse(8, 2, rxOuter, 11 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(18, 14, 12, 0.34)';
  ctx.beginPath();
  ctx.ellipse(2, 0, rxInner, 6 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// =========================================================================
// HUMAN SHARED LIMB PRIMITIVES (SMOOTH CURVES & CLEAN STROKES)
// =========================================================================
function drawHumanLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  strideOffset: number,
  isBack: boolean,
  style: HumanStylePalette
) {
  const { skin, isGirl, isAngel } = style;
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
}

function drawHumanArm(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  upperAngle: number,
  forearmAngle: number,
  sleeveColor: string,
  skinLight: string
) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(upperAngle);

  // Tapered organic upper sleeve curve (shoulder cap to elbow)
  const sg = ctx.createLinearGradient(-6, 0, 6, 28);
  sg.addColorStop(0, adjustHex(sleeveColor, 22));
  sg.addColorStop(1, adjustHex(sleeveColor, -22));
  ctx.fillStyle = sg;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.85;
  ctx.beginPath();
  ctx.moveTo(-5.8, 0);
  ctx.quadraticCurveTo(0, -4.5, 5.8, 0);
  ctx.quadraticCurveTo(6.4, 14, 5.0, 26);
  ctx.quadraticCurveTo(0, 28, -5.0, 26);
  ctx.quadraticCurveTo(-6.4, 14, -5.8, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Articulated elbow -> forearm sleeve tapering to wrist cuff
  ctx.translate(0, 25);
  ctx.rotate(forearmAngle);
  ctx.fillStyle = adjustHex(sleeveColor, -10);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.85;
  ctx.beginPath();
  ctx.moveTo(-5.1, -1);
  ctx.quadraticCurveTo(0, -3.5, 5.1, -1);
  ctx.quadraticCurveTo(5.2, 11, 4.1, 21.5);
  ctx.quadraticCurveTo(0, 23, -4.1, 21.5);
  ctx.quadraticCurveTo(-5.2, 11, -5.1, -1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Elbow cloth crease fold
  ctx.strokeStyle = 'rgba(34, 20, 14, 0.35)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.quadraticCurveTo(0, 3.5, 4, 0.5);
  ctx.stroke();

  // Sculpted hand silhouette with thumb curve
  ctx.fillStyle = skinLight;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(-3.4, 21);
  ctx.quadraticCurveTo(-5.2, 24.5, -3.5, 29.5);
  ctx.quadraticCurveTo(0, 32, 3.8, 29);
  ctx.quadraticCurveTo(5.6, 25.5, 3.6, 22.8);
  ctx.quadraticCurveTo(5.2, 21.2, 3.2, 20.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// =========================================================================
// HUMAN LAYERED PARTS (BACK LIMB/HAIR -> TORSO -> FRONT LIMB -> HEAD -> HAIR -> EXPRESSION -> ACCESSORIES)
// =========================================================================
function drawHumanBackLayer(
  ctx: CanvasRenderingContext2D,
  pose: CharacterPoseContext,
  style: HumanStylePalette
) {
  const { globalTime, charHash, lighting, breathLift } = pose;
  const { isGirl, isAngel, hair, legStride, shoulderW, backUpper, backFore, sleeveBase, skin } = style;

  // Angel layered feathered wings
  if (isAngel) {
    const wingFlap = Math.sin(globalTime * 4.2) * 0.1;
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(side * 10, -146 + breathLift);
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

  // Flowing back hair for girl & angel
  if (isGirl || isAngel) {
    const hairSway = Math.sin(globalTime * 1.8 + charHash) * 1.6;
    const bhGrad = ctx.createLinearGradient(-30, -212, 28, -124);
    bhGrad.addColorStop(0, hair.base);
    bhGrad.addColorStop(0.55, hair.high);
    bhGrad.addColorStop(1, hair.base);
    ctx.fillStyle = bhGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-18, -206 + breathLift);
    ctx.bezierCurveTo(
      -36,
      -182 + breathLift,
      -37 + hairSway,
      -150 + breathLift,
      -25 + hairSway,
      -124 + breathLift
    );
    ctx.quadraticCurveTo(-11, -120 + breathLift, -2, -135 + breathLift);
    ctx.lineTo(15, -136 + breathLift);
    ctx.quadraticCurveTo(29 + hairSway * 0.6, -148 + breathLift, 25, -172 + breathLift);
    ctx.quadraticCurveTo(22, -198 + breathLift, 12, -210 + breathLift);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = lighting.rimLight;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-25, -184 + breathLift);
    ctx.quadraticCurveTo(-30, -160 + breathLift, -23, -134 + breathLift);
    ctx.stroke();
  }

  // Back leg & back arm
  drawHumanLeg(ctx, -9, -legStride, true, style);
  drawHumanArm(
    ctx,
    -shoulderW + 2,
    -166 + breathLift,
    backUpper,
    backFore,
    adjustHex(sleeveBase, -18),
    skin.light
  );
}

function drawHumanTorsoLayer(
  ctx: CanvasRenderingContext2D,
  pose: CharacterPoseContext,
  style: HumanStylePalette
) {
  const { lighting, grainPattern, breathLift } = pose;
  const { isGirl, isBoy, isShepherd, isAngel, primaryGarment, shoulderW } = style;

  // Lower garment anchored at hip
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

  // Upper torso / jacket / tunic with breathLift
  ctx.save();
  ctx.translate(0, breathLift);

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
      ctx.strokeStyle = lighting.rimLight;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-shoulderW + 1, -167);
      ctx.quadraticCurveTo(-20, -142, -17, -116);
      ctx.stroke();
      ctx.restore();
    }
    ctx.stroke();

    ctx.strokeStyle = adjustHex(topColor, -42);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-17, -119);
    ctx.lineTo(17, -119);
    ctx.stroke();

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

  ctx.restore();
}

function drawHumanFrontLimbLayer(
  ctx: CanvasRenderingContext2D,
  pose: CharacterPoseContext,
  style: HumanStylePalette
) {
  const { breathLift } = pose;
  const { legStride, shoulderW, frontUpper, frontFore, sleeveBase, skin } = style;
  drawHumanLeg(ctx, 9, legStride, false, style);
  drawHumanArm(
    ctx,
    shoulderW - 2,
    -166 + breathLift,
    frontUpper,
    frontFore,
    sleeveBase,
    skin.light
  );
}

function drawHumanHeadLayer(
  ctx: CanvasRenderingContext2D,
  pose: CharacterPoseContext,
  style: HumanStylePalette
) {
  const { breathLift, headTilt, grainPattern } = pose;
  const { skin, isShepherd, hair } = style;

  ctx.save();
  ctx.translate(0, breathLift);

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

  // Tilted head base
  ctx.translate(0, -184);
  ctx.rotate(headTilt);
  ctx.translate(0, 184);

  [-15, 15].forEach((ex) => {
    ctx.fillStyle = skin.mid;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.ellipse(ex, -198, 3.6, 5.8, ex < 0 ? -0.15 : 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

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

  ctx.restore();
}

function drawHumanHairLayer(
  ctx: CanvasRenderingContext2D,
  pose: CharacterPoseContext,
  style: HumanStylePalette
) {
  const { breathLift, headTilt } = pose;
  const { isGirl, isAngel, hair } = style;

  ctx.save();
  ctx.translate(0, breathLift - 184);
  ctx.rotate(headTilt);
  ctx.translate(0, 184);

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

  ctx.restore();
}

function drawHumanExpressionLayer(
  ctx: CanvasRenderingContext2D,
  pose: CharacterPoseContext,
  style: HumanStylePalette
) {
  const { char, blink, mouthOpen, breathLift, headTilt } = pose;
  const { isGirl, hair, skin, irisColor } = style;

  ctx.save();
  ctx.translate(0, breathLift - 184);
  ctx.rotate(headTilt);
  ctx.translate(0, 184);

  drawBlushCheek(ctx, -8.5, -194, 4.6);
  drawBlushCheek(ctx, 9.5, -194, 4.6);

  const eyeClosed = blink || char.action === 'praying';
  drawDisneyEye(ctx, -5.6, -200, 4.5, 3.4, irisColor, eyeClosed, 0.35);
  drawDisneyEye(ctx, 6.4, -200, 4.5, 3.4, irisColor, eyeClosed, 0.35);

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

  if (mouthOpen > 0.22 && char.action !== 'listening') {
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

  ctx.restore();
}

function drawHumanAccessoriesLayer(
  ctx: CanvasRenderingContext2D,
  pose: CharacterPoseContext,
  style: HumanStylePalette
) {
  const { breathLift, headTilt, lighting } = pose;
  const { isShepherd, isAngel, isGirl } = style;

  if (isShepherd) {
    ctx.strokeStyle = '#6B3F1D';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(26, -182 + breathLift);
    ctx.arc(35, -182 + breathLift, 9, Math.PI, 0);
    ctx.stroke();
  }

  if (isGirl) {
    ctx.save();
    ctx.translate(0, breathLift - 184);
    ctx.rotate(headTilt);
    ctx.translate(0, 184);
    ctx.fillStyle = '#F472B6';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(-12, -214, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(-12, -214, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (isAngel) {
    ctx.save();
    ctx.translate(0, breathLift - 184);
    ctx.rotate(headTilt);
    ctx.translate(0, 184);
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2.8;
    ctx.shadowColor = 'rgba(250, 204, 21, 0.85)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(0, -234, 14, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  ctx.fillStyle = lighting.characterTint;
  ctx.fillRect(-35, -245, 70, 250);
}

// =========================================================================
// ANIMAL LAYERED RENDERER (BACK LIMB/TAIL -> TORSO -> FRONT LIMB -> HEAD -> MANE -> EXPRESSION -> ACCESSORIES)
// =========================================================================
function drawQuadrupedLeg(
  ctx: CanvasRenderingContext2D,
  lx: number,
  topY: number,
  swing: number,
  coatColor: string,
  hoofColor: string
) {
  const footX = lx + swing * 0.45;
  const midX = lerp(lx, footX, 0.52) + swing * 0.08;
  const midY = topY * 0.48;

  // Tapered organic quadruped limb with clean dark stroke
  const legGrad = ctx.createLinearGradient(lx - 5, topY, footX + 4, -2);
  legGrad.addColorStop(0, adjustHex(coatColor, -10));
  legGrad.addColorStop(0.55, coatColor);
  legGrad.addColorStop(1, adjustHex(coatColor, -18));

  ctx.fillStyle = legGrad;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(lx - 4.6, topY);
  ctx.quadraticCurveTo(midX - 3.6, midY, footX - 2.6, -2);
  ctx.lineTo(footX + 2.8, -2);
  ctx.quadraticCurveTo(midX + 3.8, midY, lx + 4.8, topY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = hoofColor;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(footX + 1.0, 0, 4.6, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawAnimalLayered(
  ctx: CanvasRenderingContext2D,
  pose: CharacterPoseContext
) {
  const { char, walkCycle, globalTime, charHash, blink, mouthOpen } = pose;
  const kind = char.kind;

  if (kind === 'lamb') {
    const legSwing = walkCycle * 10;
    ctx.save();
    ctx.scale(1.16, 1.16);

    // 2. Back limb / fluffy tail
    ctx.save();
    ctx.translate(-32, -35);
    ctx.rotate(Math.sin(globalTime * 2.5 + charHash) * 0.1);
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    traceScallopedLoop(ctx, -4, 0, 6.5, 5.5, 6, 2.2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawQuadrupedLeg(ctx, -16, -22, -legSwing, '#8F634E', '#3B1E12');
    drawQuadrupedLeg(ctx, 12, -22, legSwing, '#8F634E', '#3B1E12');

    // 3. Torso (single continuous scalloped cloud silhouette — zero overlapping circle artifacts)
    const woolGrad = ctx.createRadialGradient(-4, -46, 6, 0, -35, 38);
    woolGrad.addColorStop(0, '#FFFFFF');
    woolGrad.addColorStop(0.68, '#F1F5F9');
    woolGrad.addColorStop(1, '#CBD5E1');
    ctx.fillStyle = woolGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    traceScallopedLoop(ctx, 0, -36, 30, 19, 12, 6.5);
    ctx.fill();
    ctx.stroke();

    // Subtle fleece shading curl
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-6, -34, 8, 0.4, Math.PI * 1.1);
    ctx.arc(8, -38, 7, 0.2, Math.PI * 0.95);
    ctx.stroke();

    // 4. Front limbs
    drawQuadrupedLeg(ctx, -8, -22, legSwing, '#B88469', '#3B1E12');
    drawQuadrupedLeg(ctx, 20, -22, -legSwing, '#B88469', '#3B1E12');

    // 5. Head & floppy ear
    ctx.save();
    ctx.translate(16, -54);
    ctx.rotate(-0.4);
    ctx.fillStyle = '#DDA274';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#F9A8D4';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

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

    // 6. Wool crown tuft
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    traceScallopedLoop(ctx, 29, -62, 11, 5.5, 6, 3.0);
    ctx.fill();
    ctx.stroke();

    // 7. Facial expression
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

    // 8. Accessories (ribbon collar & golden bell)
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

    ctx.restore();
    return;
  }

  if (kind === 'dove') {
    const flap = Math.sin(globalTime * 9 + charHash) * 16;
    ctx.save();
    ctx.scale(1.15, 1.15);

    // 2. Back wing & tail feathers
    ctx.fillStyle = '#BAE6FD';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-4, -34);
    ctx.quadraticCurveTo(-18, -60 + flap * 0.7, 8, -42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#E0F2FE';
    ctx.beginPath();
    ctx.moveTo(-18, -28);
    ctx.lineTo(-34, -33);
    ctx.lineTo(-32, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Smooth contoured dove torso
    const bodyGrad = ctx.createRadialGradient(0, -34, 4, 0, -28, 28);
    bodyGrad.addColorStop(0, '#FFFFFF');
    bodyGrad.addColorStop(1, '#DCEEFB');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, -28, 22, 13, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4. Front wing
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-6, -30);
    ctx.quadraticCurveTo(-20, -62 - flap, 12, -38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 5. Head & beak
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(19, -38, 11.5, 0, Math.PI * 2);
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

    // 7. Expression
    drawDisneyEye(ctx, 22, -40, 3.6, 2.8, '#4A2816', blink, 0.4);

    // 8. Olive sprig accessory
    ctx.strokeStyle = '#15803D';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(33, -36);
    ctx.quadraticCurveTo(43, -32, 47, -38);
    ctx.stroke();
    ctx.fillStyle = '#22C55E';
    ctx.beginPath();
    ctx.ellipse(44, -38, 4, 2, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  if (kind === 'fish') {
    const tail = Math.sin(globalTime * 6 + charHash) * 7;
    const fishColor = normalizeCanvasColor(char.primaryColor, '#38BDF8');
    ctx.save();
    ctx.scale(1.15, 1.15);

    // 2. Flowing tail & dorsal fin
    ctx.fillStyle = adjustHex(fishColor, 26);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-24, -28);
    ctx.quadraticCurveTo(-44, -46 + tail, -46, -28 + tail * 0.4);
    ctx.quadraticCurveTo(-44, -10 + tail, -24, -28);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-6, -42);
    ctx.quadraticCurveTo(4, -55, 12, -40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Smooth contoured torso
    const bodyGrad = ctx.createRadialGradient(4, -32, 4, 0, -28, 32);
    bodyGrad.addColorStop(0, adjustHex(fishColor, 50));
    bodyGrad.addColorStop(1, adjustHex(fishColor, -28));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, -28, 29, 17.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4. Pectoral fin
    ctx.fillStyle = adjustHex(fishColor, 34);
    ctx.beginPath();
    ctx.ellipse(0, -22, 8, 4.5, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 7. Expression
    drawDisneyEye(ctx, 14, -31, 4.4, 3.4, '#1E293B', blink, 0.4);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(21, -24, 3.8, 0.2, Math.PI * 0.85);
    ctx.stroke();

    // 8. Shimmering scale arcs
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    for (let s = -12; s <= 4; s += 8) {
      ctx.beginPath();
      ctx.arc(s, -28, 6.5, -0.7, 0.7);
      ctx.stroke();
    }

    ctx.restore();
    return;
  }

  // Lion or Donkey (full 8-layer quadruped)
  const isLion = kind === 'lion';
  const legSwing = walkCycle * 10;
  const coatMain = isLion ? '#E59528' : '#8A94A3';
  const coatLight = isLion ? '#FCD581' : '#CBD5E1';
  const hoofColor = isLion ? '#78350F' : '#334155';

  ctx.save();
  ctx.scale(1.18, 1.18);

  // 2. Back limbs & sculpted tail
  ctx.save();
  ctx.translate(-30, -40);
  ctx.rotate(Math.sin(globalTime * 2.2 + charHash) * 0.12);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-13, -12, -17, -20);
  ctx.stroke();
  ctx.fillStyle = isLion ? '#92400E' : '#475569';
  ctx.beginPath();
  ctx.arc(-18, -21, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawQuadrupedLeg(ctx, -18, -26, -legSwing, adjustHex(coatMain, -16), hoofColor);
  drawQuadrupedLeg(ctx, 10, -26, -legSwing, adjustHex(coatMain, -16), hoofColor);

  // 3. Shaded quadruped torso
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

  // 4. Front limbs
  drawQuadrupedLeg(ctx, -6, -26, legSwing, coatMain, hoofColor);
  drawQuadrupedLeg(ctx, 22, -26, legSwing, coatMain, hoofColor);

  // 5/6. Mane / Ears & Head
  if (isLion) {
    const maneGrad = ctx.createRadialGradient(28, -56, 6, 28, -54, 28);
    maneGrad.addColorStop(0, '#B45309');
    maneGrad.addColorStop(1, '#78350F');
    ctx.fillStyle = maneGrad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    traceScallopedLoop(ctx, 28, -54, 21, 21, 10, 5.5);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = coatMain;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.ellipse(20, -75, 5, 15, -0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(31, -75, 5, 15, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const headGrad = ctx.createRadialGradient(28, -58, 4, 29, -54, 18);
  headGrad.addColorStop(0, coatLight);
  headGrad.addColorStop(1, coatMain);
  ctx.fillStyle = headGrad;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.arc(29, -54, 16.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FEF3C7';
  ctx.beginPath();
  ctx.ellipse(36, -48, 9.5, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // 7. Facial expression
  drawBlushCheek(ctx, 26, -50, 4.2);
  drawDisneyEye(ctx, 32, -57, 4.2, 3.2, '#4A2816', blink, 0.4);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(41, -50, 3.2, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(37, -46, 4, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.restore();
}

// =========================================================================
// PUBLIC ENTRYPOINT: drawCharacter(ctx, characterSpec)
// =========================================================================
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  characterSpec: CharacterRenderSpec
) {
  const {
    character: char,
    x,
    y,
    sceneWidth = 1280,
    globalTime,
    sceneProgress,
    speechAmp,
    lighting,
    grainPattern,
  } = characterSpec;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const charHash = hashString(char.name || char.kind);
  const isMovingAcross = Math.abs(char.endX - char.startX) > 0.035;
  const isActuallyWalking =
    char.action === 'walking' &&
    isMovingAcross &&
    sceneProgress > 0.04 &&
    sceneProgress < 0.94;
  const walkCycle = isActuallyWalking ? Math.sin(globalTime * 4.2 + charHash) : 0;

  // Grounded movie physics: only flying dove or swimming fish leaves ground
  const groundOffset =
    char.kind === 'dove' && char.action === 'flying'
      ? Math.sin(globalTime * 2.8 + charHash) * 7 - 92
      : char.kind === 'fish' && char.action === 'swimming'
      ? Math.sin(globalTime * 2.2 + charHash) * 3
      : 0;

  const walkWeightShift = isActuallyWalking ? Math.abs(walkCycle) * 1.4 : 0;
  const yOffset = groundOffset + walkWeightShift;
  const facingRight = isMovingAcross ? char.endX >= char.startX : x <= sceneWidth * 0.52;
  const dir = facingRight ? 1 : -1;

  const isListening = char.action === 'listening';
  const talkEnergy =
    isListening || isActuallyWalking
      ? 0
      : Math.max(0, Math.min(1, (speechAmp - 0.16) * 2.2));
  const breathLift = isListening
    ? Math.sin(globalTime * 1.4 + charHash) * 0.45
    : Math.sin(globalTime * 1.9 + charHash) * 0.65;
  const headTilt =
    char.action === 'praying'
      ? 0.05
      : isListening
      ? 0
      : Math.sin(globalTime * 1.8 + charHash) * 0.03 * talkEnergy;

  const blink = Math.sin(globalTime * 1.55 + (charHash % 17)) > 0.968;
  const mouthOpen = Math.min(1, speechAmp * 1.5);

  const pose: CharacterPoseContext = {
    char,
    charHash,
    globalTime,
    sceneProgress,
    speechAmp,
    isMovingAcross,
    isActuallyWalking,
    walkCycle,
    groundOffset,
    yOffset,
    dir,
    blink,
    mouthOpen,
    isListening,
    talkEnergy,
    breathLift,
    headTilt,
    lighting,
    grainPattern,
  };

  const isAnimal =
    char.kind === 'lamb' ||
    char.kind === 'dove' ||
    char.kind === 'lion' ||
    char.kind === 'fish' ||
    char.kind === 'donkey';
  const isQuadruped =
    char.kind === 'lamb' || char.kind === 'lion' || char.kind === 'donkey';

  ctx.translate(x, y + yOffset);

  // Layer 1: Ground shadow
  drawCharacterShadow(ctx, yOffset, groundOffset, isQuadruped);

  // Orient character cleanly
  ctx.scale(dir, 1);

  if (isAnimal) {
    // Layers 2-8 for animals (back limb/tail -> torso -> front limb -> head -> mane -> expression -> accessories)
    drawAnimalLayered(ctx, pose);
  } else {
    // Layers 2-8 for humans
    const style = buildHumanStylePalette(pose);
    ctx.save();
    ctx.scale(style.scale, style.scale);

    drawHumanBackLayer(ctx, pose, style);
    drawHumanTorsoLayer(ctx, pose, style);
    drawHumanFrontLimbLayer(ctx, pose, style);
    drawHumanHeadLayer(ctx, pose, style);
    drawHumanHairLayer(ctx, pose, style);
    drawHumanExpressionLayer(ctx, pose, style);
    drawHumanAccessoriesLayer(ctx, pose, style);

    ctx.restore();
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
