import * as Mp4Muxer from 'mp4-muxer';
import type {
  GeneratedStory,
  SceneCharacter,
  StoryScene,
  TimeOfDay,
} from '../types/story';

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;

interface SkyPalette {
  top: string;
  bottom: string;
  sunColor: string;
  hillFar: string;
  hillMid: string;
  hillNear: string;
}

const SKY_PALETTES: Record<TimeOfDay, SkyPalette> = {
  morning: {
    top: '#60A5FA',
    bottom: '#FEF3C7',
    sunColor: '#FDE047',
    hillFar: '#86EFAC',
    hillMid: '#4ADE80',
    hillNear: '#22C55E',
  },
  noon: {
    top: '#38BDF8',
    bottom: '#E0F2FE',
    sunColor: '#FACC15',
    hillFar: '#6EE7B7',
    hillMid: '#34D399',
    hillNear: '#16A34A',
  },
  golden_hour: {
    top: '#FB923C',
    bottom: '#FDE68A',
    sunColor: '#FEF08A',
    hillFar: '#A3E635',
    hillMid: '#65A30D',
    hillNear: '#4D7C0F',
  },
  twilight: {
    top: '#6D28D9',
    bottom: '#F472B6',
    sunColor: '#FDE68A',
    hillFar: '#4C1D95',
    hillMid: '#3B0764',
    hillNear: '#1E1B4B',
  },
  starlight: {
    top: '#0F172A',
    bottom: '#312E81',
    sunColor: '#F8FAFC',
    hillFar: '#1E293B',
    hillMid: '#0F172A',
    hillNear: '#064E3B',
  },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function easeInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
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

function drawCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  alpha = 0.9
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.arc(38, -10, 44, 0, Math.PI * 2);
  ctx.arc(80, 0, 34, 0, Math.PI * 2);
  ctx.arc(40, 12, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  sway: number,
  isPalm = false
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  if (isPalm) {
    ctx.strokeStyle = '#92400E';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(12 + sway * 8, -75, 20 + sway * 16, -150);
    ctx.stroke();

    ctx.translate(20 + sway * 16, -150);
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3 + sway * 0.08);
      ctx.fillStyle = i % 2 === 0 ? '#16A34A' : '#22C55E';
      ctx.beginPath();
      ctx.ellipse(38, 0, 42, 12, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#78350F';
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-8, -95);
    ctx.lineTo(8, -95);
    ctx.lineTo(14, 0);
    ctx.closePath();
    ctx.fill();

    ctx.translate(sway * 5, -105);
    ctx.fillStyle = '#15803D';
    ctx.beginPath();
    ctx.arc(-28, 10, 38, 0, Math.PI * 2);
    ctx.arc(28, 12, 36, 0, Math.PI * 2);
    ctx.arc(0, -18, 46, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#22C55E';
    ctx.beginPath();
    ctx.arc(-18, 2, 26, 0, Math.PI * 2);
    ctx.arc(18, 4, 24, 0, Math.PI * 2);
    ctx.arc(0, -16, 32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCottage(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Warm sandstone biblical house
  ctx.fillStyle = '#FEF3C7';
  drawRoundedRect(ctx, -55, -75, 110, 75, 6);
  ctx.fill();
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Terracotta dome/roof
  ctx.fillStyle = '#EA580C';
  ctx.beginPath();
  ctx.moveTo(-64, -74);
  ctx.lineTo(0, -112);
  ctx.lineTo(64, -74);
  ctx.closePath();
  ctx.fill();

  // Arched door
  ctx.fillStyle = '#92400E';
  ctx.beginPath();
  ctx.arc(0, -28, 16, Math.PI, 0);
  ctx.lineTo(16, 0);
  ctx.lineTo(-16, 0);
  ctx.closePath();
  ctx.fill();

  // Warm glowing window
  ctx.fillStyle = '#FDE047';
  ctx.beginPath();
  ctx.arc(-30, -45, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  char: SceneCharacter,
  x: number,
  y: number,
  globalTime: number,
  sceneProgress: number,
  speechAmp: number
) {
  ctx.save();

  const walkCycle =
    char.action === 'walking' || char.action === 'dolly_follow' as never
      ? Math.sin(globalTime * 7)
      : 0;
  const jumpOffset =
    char.action === 'jumping' || char.action === 'celebrating'
      ? Math.abs(Math.sin(globalTime * 6)) * -26
      : char.action === 'flying'
      ? Math.sin(globalTime * 4) * 16 - 85
      : char.action === 'swimming'
      ? Math.sin(globalTime * 3.5) * 6
      : 0;

  const bob = Math.abs(walkCycle) * -5 + jumpOffset;
  const facingRight = char.endX >= char.startX;
  const dir = facingRight ? 1 : -1;

  ctx.translate(x, y + bob);

  // Soft ground shadow
  ctx.save();
  ctx.translate(0, -bob + 4);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 32, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.scale(dir, 1);

  const isAnimal =
    char.kind === 'lamb' ||
    char.kind === 'dove' ||
    char.kind === 'lion' ||
    char.kind === 'fish' ||
    char.kind === 'donkey';

  const blink = Math.sin(globalTime * 1.9 + char.startX * 10) > 0.96;
  const mouthOpen = Math.min(1, speechAmp * 1.5);

  if (char.kind === 'lamb') {
    // Cute fluffy lamb
    const legSwing = walkCycle * 10;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    [
      [-18, legSwing],
      [-6, -legSwing],
      [10, legSwing],
      [22, -legSwing],
    ].forEach(([lx, swing]) => {
      ctx.beginPath();
      ctx.moveTo(lx, -22);
      ctx.lineTo(lx + swing * 0.4, 0);
      ctx.stroke();
    });

    // Fluffy cloud wool body
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-16, -34, 18, 0, Math.PI * 2);
    ctx.arc(0, -40, 22, 0, Math.PI * 2);
    ctx.arc(18, -34, 18, 0, Math.PI * 2);
    ctx.arc(2, -26, 20, 0, Math.PI * 2);
    ctx.fill();

    // Tail wag
    ctx.save();
    ctx.translate(-30, -34);
    ctx.rotate(Math.sin(globalTime * 10) * 0.35);
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.arc(-5, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Head
    ctx.fillStyle = '#FFE4D6';
    ctx.beginPath();
    ctx.ellipse(28, -46, 15, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    // Floppy ears
    ctx.fillStyle = '#FBCFE8';
    ctx.beginPath();
    ctx.ellipse(18, -50, 9, 5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // Wool puff
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(26, -58, 9, 0, Math.PI * 2);
    ctx.fill();
    // Eye
    ctx.fillStyle = '#0F172A';
    if (blink) {
      ctx.fillRect(30, -49, 5, 1.5);
    } else {
      ctx.beginPath();
      ctx.arc(33, -48, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Smile
    ctx.strokeStyle = '#BE123C';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(33, -42, 4 + mouthOpen * 2, 0.1, Math.PI - 0.2);
    ctx.stroke();
  } else if (char.kind === 'dove') {
    const flap = Math.sin(globalTime * 14) * 18;
    ctx.fillStyle = '#FFFFFF';
    // Body
    ctx.beginPath();
    ctx.ellipse(0, -30, 22, 13, -0.1, 0, Math.PI * 2);
    ctx.fill();
    // Wing
    ctx.fillStyle = '#E0F2FE';
    ctx.beginPath();
    ctx.moveTo(-6, -32);
    ctx.quadraticCurveTo(-18, -58 + flap, 10, -40);
    ctx.closePath();
    ctx.fill();
    // Head
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(20, -38, 10, 0, Math.PI * 2);
    ctx.fill();
    // Beak
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.moveTo(29, -39);
    ctx.lineTo(37, -36);
    ctx.lineTo(29, -34);
    ctx.closePath();
    ctx.fill();
    // Eye
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(22, -40, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (char.kind === 'fish') {
    const tail = Math.sin(globalTime * 9) * 8;
    ctx.fillStyle = char.primaryColor || '#38BDF8';
    ctx.beginPath();
    ctx.ellipse(0, -28, 28, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-24, -28);
    ctx.lineTo(-42, -42 + tail);
    ctx.lineTo(-42, -14 + tail);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(14, -32, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(15, -32, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (char.kind === 'lion' || char.kind === 'donkey') {
    const isLion = char.kind === 'lion';
    const legSwing = walkCycle * 10;
    ctx.strokeStyle = isLion ? '#B45309' : '#64748B';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    [
      [-20, legSwing],
      [-8, -legSwing],
      [12, legSwing],
      [22, -legSwing],
    ].forEach(([lx, swing]) => {
      ctx.beginPath();
      ctx.moveTo(lx, -26);
      ctx.lineTo(lx + swing * 0.4, 0);
      ctx.stroke();
    });

    ctx.fillStyle = isLion ? '#F59E0B' : '#94A3B8';
    ctx.beginPath();
    ctx.ellipse(0, -38, 30, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isLion) {
      ctx.fillStyle = '#B45309';
      ctx.beginPath();
      ctx.arc(28, -52, 21, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Donkey ears
      ctx.fillStyle = '#64748B';
      ctx.beginPath();
      ctx.ellipse(22, -74, 5, 15, -0.2, 0, Math.PI * 2);
      ctx.ellipse(31, -74, 5, 15, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = isLion ? '#FBBF24' : '#CBD5E1';
    ctx.beginPath();
    ctx.arc(28, -52, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(33, -55, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(33, -48, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else {
    // Humanoid animated kids/biblical characters (boy, girl, shepherd, angel)
    const isGirl = char.kind === 'girl';
    const isShepherd = char.kind === 'shepherd';
    const isAngel = char.kind === 'angel';
    const robeColor = char.primaryColor || (isGirl ? '#8B5CF6' : isShepherd ? '#D97706' : '#3B82F6');

    if (isAngel) {
      const wingFlap = Math.sin(globalTime * 7) * 0.16;
      ctx.save();
      ctx.translate(-8, -72);
      ctx.rotate(-0.3 + wingFlap);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.ellipse(-22, -10, 28, 14, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Legs
    const legSwing = walkCycle * 12;
    ctx.strokeStyle = '#92400E';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, -26);
    ctx.lineTo(-7 - legSwing * 0.5, 0);
    ctx.moveTo(7, -26);
    ctx.lineTo(7 + legSwing * 0.5, 0);
    ctx.stroke();

    // Tunic / Robe
    ctx.fillStyle = isAngel ? '#F8FAFC' : robeColor;
    ctx.beginPath();
    ctx.moveTo(-16, -72);
    ctx.lineTo(16, -72);
    ctx.lineTo(22, -20);
    ctx.lineTo(-22, -20);
    ctx.closePath();
    ctx.fill();

    // Sash
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-17, -50, 34, 6);

    // Waving / Moving Arms
    const waveAngle =
      char.action === 'waving' || char.action === 'celebrating'
        ? -2.2 + Math.sin(globalTime * 8) * 0.45
        : char.action === 'praying'
        ? -0.9
        : walkCycle * 0.4;

    ctx.strokeStyle = '#FDBA74';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(14, -68);
    ctx.lineTo(
      14 + Math.cos(waveAngle) * 24,
      -68 + Math.sin(waveAngle) * 24
    );
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-14, -68);
    ctx.lineTo(-14 - walkCycle * 8, -44);
    ctx.stroke();

    // Shepherd staff
    if (isShepherd) {
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(26, -102);
      ctx.arc(34, -102, 8, Math.PI, 0);
      ctx.stroke();
    }

    // Head
    ctx.fillStyle = '#FDE6C4';
    ctx.beginPath();
    ctx.arc(0, -90, 20, 0, Math.PI * 2);
    ctx.fill();

    // Hair / Headpiece
    ctx.fillStyle = isGirl ? '#451A03' : isShepherd ? '#78350F' : '#1E293B';
    ctx.beginPath();
    ctx.arc(0, -95, 20, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    if (isGirl) {
      ctx.beginPath();
      ctx.arc(-16, -86, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    if (isAngel) {
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, -118, 14, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Eyes
    ctx.fillStyle = '#0F172A';
    if (blink) {
      ctx.fillRect(-9, -92, 5, 2);
      ctx.fillRect(4, -92, 5, 2);
    } else {
      ctx.beginPath();
      ctx.arc(-6, -91, 2.8, 0, Math.PI * 2);
      ctx.arc(7, -91, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rosy cheeks
    ctx.fillStyle = 'rgba(244, 114, 182, 0.45)';
    ctx.beginPath();
    ctx.arc(-12, -84, 3.5, 0, Math.PI * 2);
    ctx.arc(12, -84, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Expressive talking mouth
    ctx.fillStyle = '#BE123C';
    if (mouthOpen > 0.25) {
      ctx.beginPath();
      ctx.ellipse(1, -81, 5, 2 + mouthOpen * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#BE123C';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(1, -83, 5, 0.15, Math.PI - 0.15);
      ctx.stroke();
    }
  }

  ctx.restore();

  // Character name label gently fading in at start of scene
  if (sceneProgress < 0.35 && !isAnimal) {
    const labelAlpha = Math.sin((sceneProgress / 0.35) * Math.PI);
    ctx.save();
    ctx.globalAlpha = labelAlpha * 0.85;
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.fillText(char.name, x, y + 24);
    ctx.restore();
  }
}

function drawWeatherParticles(
  ctx: CanvasRenderingContext2D,
  effect: StoryScene['weatherEffect'],
  t: number
) {
  ctx.save();
  if (effect === 'sunbeams') {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const grad = ctx.createLinearGradient(150 + i * 240, 0, 320 + i * 220, HEIGHT);
      grad.addColorStop(0, `rgba(254, 240, 138, ${0.12 + Math.sin(t + i) * 0.04})`);
      grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(120 + i * 240, 0);
      ctx.lineTo(220 + i * 240, 0);
      ctx.lineTo(440 + i * 210, HEIGHT);
      ctx.lineTo(260 + i * 210, HEIGHT);
      ctx.closePath();
      ctx.fill();
    }
  } else if (effect === 'fireflies' || effect === 'sparkles') {
    for (let i = 0; i < 24; i++) {
      const px = ((i * 197 + t * 28 * ((i % 3) + 1)) % (WIDTH + 40)) - 20;
      const py = 120 + ((i * 89) % 440) + Math.sin(t * 2.5 + i) * 24;
      const glow = 0.4 + Math.abs(Math.sin(t * 3 + i * 1.7)) * 0.6;
      ctx.fillStyle =
        effect === 'fireflies'
          ? `rgba(253, 224, 71, ${glow})`
          : `rgba(255, 255, 255, ${glow})`;
      ctx.beginPath();
      ctx.arc(px, py, 3 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (effect === 'petals') {
    for (let i = 0; i < 18; i++) {
      const px = ((i * 143 + t * 42) % (WIDTH + 40)) - 20;
      const py = ((i * 71 + t * 55) % (HEIGHT - 80));
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t * 2 + i);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(244, 114, 182, 0.8)' : 'rgba(253, 186, 116, 0.85)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (effect === 'rain_to_rainbow') {
    const colors = ['#EF4444', '#F97316', '#FACC15', '#22C55E', '#3B82F6', '#8B5CF6'];
    colors.forEach((c, idx) => {
      ctx.strokeStyle = c;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(WIDTH * 0.5, HEIGHT * 0.78, 420 - idx * 14, Math.PI, 0);
      ctx.stroke();
    });
  }
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

  const introOffset = 1.0;
  const outroDuration = 2.4;
  const activeDuration = Math.max(10, totalDurationSec - introOffset - outroDuration);
  const sceneDur = activeDuration / scenes.length;
  const storyTime = Math.max(0, timeSec - introOffset);
  const sceneIdx = Math.min(scenes.length - 1, Math.floor(storyTime / sceneDur));
  const scene = scenes[sceneIdx];
  const sceneLocalTime = storyTime - sceneIdx * sceneDur;
  const sceneProgress = Math.max(0, Math.min(1, sceneLocalTime / sceneDur));

  const palette = SKY_PALETTES[scene.timeOfDay] ?? SKY_PALETTES.morning;

  ctx.save();
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // Camera transform
  let camScale = 1.0;
  let camX = 0;
  let camY = 0;
  const eased = easeInOut(sceneProgress);

  switch (scene.cameraMove) {
    case 'zoom_in':
      camScale = lerp(1.0, 1.12, eased);
      break;
    case 'zoom_out':
      camScale = lerp(1.12, 1.0, eased);
      break;
    case 'pan_right':
      camScale = 1.08;
      camX = lerp(38, -38, eased);
      break;
    case 'pan_left':
      camScale = 1.08;
      camX = lerp(-38, 38, eased);
      break;
    case 'crane_up':
      camScale = 1.06;
      camY = lerp(24, -18, eased);
      break;
    case 'dolly_follow':
      camScale = 1.05;
      camX = lerp(24, -24, eased);
      break;
  }

  ctx.translate(WIDTH / 2 + camX, HEIGHT / 2 + camY);
  ctx.scale(camScale, camScale);
  ctx.translate(-WIDTH / 2, -HEIGHT / 2);

  // 1. Sky Gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.72);
  skyGrad.addColorStop(0, palette.top);
  skyGrad.addColorStop(1, palette.bottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-100, -100, WIDTH + 200, HEIGHT + 200);

  // Stars if night
  if (scene.timeOfDay === 'starlight' || scene.timeOfDay === 'twilight') {
    for (let i = 0; i < 42; i++) {
      const sx = (i * 179) % WIDTH;
      const sy = (i * 67) % 320;
      const tw = 0.4 + Math.abs(Math.sin(timeSec * 2.4 + i)) * 0.6;
      ctx.fillStyle = `rgba(255,255,255,${tw})`;
      ctx.beginPath();
      ctx.arc(sx, sy, (i % 2) + 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sun or Moon
  const celestialX = scene.timeOfDay === 'golden_hour' ? WIDTH * 0.78 : WIDTH * 0.22;
  const celestialY = scene.timeOfDay === 'golden_hour' ? 190 : 125;
  ctx.fillStyle = palette.sunColor;
  ctx.beginPath();
  ctx.arc(celestialX, celestialY, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.arc(celestialX, celestialY, 68 + Math.sin(timeSec * 2) * 6, 0, Math.PI * 2);
  ctx.fill();

  // Rainbow environment
  if (scene.environment === 'rainbow_sky') {
    drawWeatherParticles(ctx, 'rain_to_rainbow', timeSec);
  }

  // Drifting Clouds
  drawCloud(ctx, ((timeSec * 14 + 120) % (WIDTH + 280)) - 140, 110, 0.95);
  drawCloud(ctx, ((timeSec * 9 + 620) % (WIDTH + 280)) - 140, 165, 0.75);
  drawCloud(ctx, ((timeSec * 11 + 1020) % (WIDTH + 280)) - 140, 95, 0.85);

  // Distant Hills
  const isDesert = scene.environment === 'desert_oasis';
  ctx.fillStyle = isDesert ? '#FCD34D' : palette.hillFar;
  ctx.beginPath();
  ctx.moveTo(-100, HEIGHT);
  ctx.lineTo(-100, 440);
  ctx.quadraticCurveTo(WIDTH * 0.25, 360, WIDTH * 0.55, 430);
  ctx.quadraticCurveTo(WIDTH * 0.85, 480, WIDTH + 100, 390);
  ctx.lineTo(WIDTH + 100, HEIGHT);
  ctx.closePath();
  ctx.fill();

  // Midground Hills
  ctx.fillStyle = isDesert ? '#FBBF24' : palette.hillMid;
  ctx.beginPath();
  ctx.moveTo(-100, HEIGHT);
  ctx.lineTo(-100, 500);
  ctx.quadraticCurveTo(WIDTH * 0.35, 440, WIDTH * 0.7, 505);
  ctx.quadraticCurveTo(WIDTH * 0.9, 535, WIDTH + 100, 485);
  ctx.lineTo(WIDTH + 100, HEIGHT);
  ctx.closePath();
  ctx.fill();

  // Waterfront / Water strip
  if (scene.environment === 'waterfront' || scene.environment === 'desert_oasis') {
    const waterGrad = ctx.createLinearGradient(0, 515, 0, HEIGHT);
    waterGrad.addColorStop(0, '#0EA5E9');
    waterGrad.addColorStop(1, '#0284C7');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(-100, 515, WIDTH + 200, HEIGHT - 515);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 3;
    for (let w = 0; w < 6; w++) {
      const wy = 545 + w * 26;
      const wx = ((timeSec * 30 + w * 180) % WIDTH) - 60;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 40, wy - 6, wx + 80, wy);
      ctx.stroke();
    }
  }

  // Foreground Ground
  ctx.fillStyle = isDesert ? '#F59E0B' : palette.hillNear;
  ctx.beginPath();
  ctx.moveTo(-100, HEIGHT);
  const groundTop = scene.environment === 'waterfront' ? 595 : 540;
  ctx.lineTo(-100, groundTop);
  ctx.quadraticCurveTo(WIDTH * 0.5, groundTop - 28, WIDTH + 100, groundTop + 10);
  ctx.lineTo(WIDTH + 100, HEIGHT + 100);
  ctx.closePath();
  ctx.fill();

  // Environment Props (trees, cottages, swaying flowers)
  const treeSway = Math.sin(timeSec * 1.8);
  if (scene.environment === 'village') {
    drawCottage(ctx, 210, 535, 1.0);
    drawCottage(ctx, 1060, 540, 0.85);
    drawTree(ctx, 90, 548, 0.9, treeSway, false);
    drawTree(ctx, 1185, 555, 1.0, -treeSway, false);
  } else if (isDesert) {
    drawTree(ctx, 150, 550, 1.05, treeSway, true);
    drawTree(ctx, 1120, 555, 0.95, -treeSway, true);
  } else {
    drawTree(ctx, 130, 545, 1.0, treeSway, false);
    drawTree(ctx, 1140, 550, 1.1, -treeSway, false);
  }

  // Swaying meadow wildflowers
  if (!isDesert && scene.environment !== 'waterfront') {
    const flowerColors = ['#FDE047', '#F472B6', '#FB923C', '#FFFFFF'];
    for (let f = 0; f < 14; f++) {
      const fx = 80 + f * 86;
      const fy = 610 + (f % 3) * 28;
      const sway = Math.sin(timeSec * 2.6 + f) * 4;
      ctx.strokeStyle = '#15803D';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + sway, fy - 16);
      ctx.stroke();
      ctx.fillStyle = flowerColors[f % flowerColors.length];
      ctx.beginPath();
      ctx.arc(fx + sway, fy - 18, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Animated Characters
  scene.characters.forEach((char) => {
    const cx = lerp(char.startX * WIDTH, char.endX * WIDTH, eased);
    const cy =
      char.kind === 'fish'
        ? 635
        : scene.environment === 'waterfront'
        ? 608
        : 585;
    drawCharacter(ctx, char, cx, cy, timeSec, sceneProgress, speechAmp);
  });

  // Weather / Magic Particles
  drawWeatherParticles(ctx, scene.weatherEffect, timeSec);

  ctx.restore();

  // Scene Transition Overlay (first 0.85s of scene)
  if (sceneLocalTime < 0.85 && sceneIdx > 0) {
    const tp = sceneLocalTime / 0.85;
    ctx.save();
    if (scene.transitionIn === 'iris_open') {
      const radius = tp * WIDTH * 0.8;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.beginPath();
      ctx.rect(0, 0, WIDTH, HEIGHT);
      ctx.arc(WIDTH / 2, HEIGHT / 2, radius, 0, Math.PI * 2, true);
      ctx.fill();
    } else if (scene.transitionIn === 'wipe_horizon') {
      ctx.fillStyle = 'rgba(109, 40, 217, 0.35)';
      ctx.fillRect(WIDTH * tp, 0, WIDTH * (1 - tp), HEIGHT);
    } else {
      ctx.fillStyle = `rgba(255, 255, 255, ${(1 - tp) * 0.45})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    ctx.restore();
  }

  // Opening Title Overlay (first 3.2s)
  if (timeSec < 3.2) {
    const titleAlpha = timeSec < 0.6 ? timeSec / 0.6 : timeSec > 2.4 ? (3.2 - timeSec) / 0.8 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, titleAlpha));
    ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
    drawRoundedRect(ctx, WIDTH * 0.16, HEIGHT * 0.32, WIDTH * 0.68, 170, 22);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = '700 38px "Plus Jakarta Sans", "Noto Sans Tamil", sans-serif';
    ctx.fillText(story.title, WIDTH / 2, HEIGHT * 0.32 + 78, WIDTH * 0.62);

    ctx.fillStyle = '#DDD6FE';
    ctx.font = '500 20px "Plus Jakarta Sans", "Noto Sans Tamil", sans-serif';
    ctx.fillText(story.bibleReference, WIDTH / 2, HEIGHT * 0.32 + 124, WIDTH * 0.6);
    ctx.restore();
  }

  // Ending Moral Lesson Card (last 3.0s)
  if (timeSec > totalDurationSec - 3.2) {
    const endAlpha = Math.min(1, (timeSec - (totalDurationSec - 3.2)) / 0.7);
    ctx.save();
    ctx.globalAlpha = endAlpha;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    drawRoundedRect(ctx, WIDTH * 0.14, HEIGHT * 0.28, WIDTH * 0.72, 200, 24);
    ctx.fill();

    ctx.fillStyle = '#A7F3D0';
    ctx.textAlign = 'center';
    ctx.font = '600 18px "Plus Jakarta Sans", "Noto Sans Tamil", sans-serif';
    ctx.fillText('MORAL LESSON', WIDTH / 2, HEIGHT * 0.28 + 56);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 28px "Plus Jakarta Sans", "Noto Sans Tamil", sans-serif';
    ctx.fillText(story.moralLesson, WIDTH / 2, HEIGHT * 0.28 + 114, WIDTH * 0.64);

    ctx.fillStyle = '#C4B5FD';
    ctx.font = '500 18px "Plus Jakarta Sans", "Noto Sans Tamil", sans-serif';
    ctx.fillText(story.bibleReference, WIDTH / 2, HEIGHT * 0.28 + 162, WIDTH * 0.62);
    ctx.restore();
  }

  // Storyboard Subtitle Strip at Bottom
  if (timeSec >= 3.2 && timeSec <= totalDurationSec - 3.2 && scene.subtitleCaption) {
    ctx.save();
    const grad = ctx.createLinearGradient(0, HEIGHT - 120, 0, HEIGHT);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.82)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, HEIGHT - 120, WIDTH, 120);

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = '600 24px "Plus Jakarta Sans", "Noto Sans Tamil", sans-serif';
    ctx.fillText(scene.subtitleCaption, WIDTH / 2, HEIGHT - 34, WIDTH - 140);
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
    bitrate: 2_600_000,
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

  // Encode stereo audio in 4096-frame blocks
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

  // Render & encode video frames faster-than-real-time
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
        videoBitsPerSecond: 2_500_000,
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
