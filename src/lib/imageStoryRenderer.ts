import type {
  GeneratedStory,
  SceneCharacter,
  ScenicFocus,
  StoryScene,
} from '../types/story';
import {
  drawAtmosphericParticles,
  drawCharacter,
  drawPaintedFallbackBackdrop,
  drawTitleAndMoralOverlays,
  easeInOut,
  encodeCanvasVideo,
  getBackdropImage,
  getPainterlyGrainPattern,
  HEIGHT,
  lerp,
  preloadEnvironmentBackdrops,
  resolveActiveSceneAtTime,
  TIME_LIGHTING,
  WIDTH,
} from './animationRenderer';

const PLATE_W = 1440;
const PLATE_H = 810;

const scenePlateCache = new Map<string, HTMLCanvasElement[]>();

function collectSceneStoryProps(scene: StoryScene): ScenicFocus[] {
  const props = new Set<ScenicFocus>();
  if (scene.scenicFocus && scene.scenicFocus !== 'none') {
    props.add(scene.scenicFocus);
  }
  if (Array.isArray(scene.storyProps)) {
    for (const p of scene.storyProps) {
      if (p && p !== 'none') props.add(p);
    }
  }

  const text = `${scene.title} ${scene.imagePrompt ?? ''} ${scene.narration ?? ''} ${scene.narrationSegment ?? ''} ${scene.visualDescription ?? ''}`.toLowerCase();

  if (text.includes('rainbow') || scene.environment === 'rainbow_sky') props.add('rainbow_arc');
  if (text.includes('ark') || text.includes('flood')) props.add('wooden_ark');
  if (text.includes('loaves') || text.includes('bread') || text.includes('basket') || (text.includes('fish') && text.includes('five'))) {
    props.add('loaves_and_fish');
  }
  if (text.includes('harp') || text.includes('lyre') || text.includes('song') || text.includes('sling')) {
    props.add('golden_harp');
  }
  if (text.includes('manger') || text.includes('bethlehem') || text.includes('baby jesus') || text.includes('stable')) {
    props.add('manger_cradle');
  }
  if (text.includes('sycamore') || text.includes('zacchaeus') || text.includes('climbed')) {
    props.add('sycamore_tree');
  }
  if (text.includes('well') || text.includes('jar') || text.includes('pitcher')) {
    props.add('stone_well');
  }
  if (text.includes('den') || text.includes('cave') || text.includes('daniel')) {
    props.add('lions_den');
  }
  if (text.includes('boat') || text.includes('storm') || text.includes('sea') || text.includes('lake') || text.includes('waves')) {
    props.add('fishing_boat');
  }
  if (text.includes('star') || text.includes('night') || scene.environment === 'starry_night') {
    props.add('glowing_star');
  }
  if (text.includes('sheep') || text.includes('lamb') || text.includes('shepherd') || text.includes('pasture')) {
    props.add('shepherd_hills');
  }
  if (text.includes('bridge') || text.includes('river') || text.includes('stream')) {
    props.add('stone_bridge');
  }
  if (text.includes('olive') || text.includes('tree') || text.includes('branch')) {
    props.add('olive_tree');
  }
  if (text.includes('flower') || text.includes('garden') || scene.environment === 'garden') {
    props.add('flower_arch');
  }
  if (text.includes('village') || text.includes('lantern') || text.includes('town') || scene.environment === 'village') {
    props.add('lantern_village');
  }
  if (text.includes('desert') || text.includes('oasis') || text.includes('palm') || scene.environment === 'desert_oasis') {
    props.add('desert_palms');
  }
  if (text.includes('mountain') || text.includes('hill') || text.includes('sunrise') || scene.environment === 'hilltop') {
    props.add('mountain_sunrise');
  }

  return Array.from(props).slice(0, 3);
}

function resolveStaticSceneCharacters(scene: StoryScene): SceneCharacter[] {
  if (Array.isArray(scene.characters) && scene.characters.length > 0) {
    return scene.characters.map((c) => ({
      ...c,
      endX: c.startX,
    }));
  }

  // Fallback inference directly from imagePrompt / narration when legacy records lack character specs
  const text = `${scene.title} ${scene.imagePrompt ?? ''} ${scene.narration ?? ''} ${scene.narrationSegment ?? ''}`.toLowerCase();
  const inferred: SceneCharacter[] = [];

  if (text.includes('shepherd') || text.includes('david') || text.includes('noah') || text.includes('jesus') || text.includes('moses') || text.includes('daniel') || text.includes('samaritan')) {
    inferred.push({
      name: 'Story Hero',
      kind: 'shepherd',
      action: 'listening',
      mood: 'gentle',
      primaryColor: '#4F46E5',
      startX: 0.42,
      endX: 0.42,
    });
  } else if (text.includes('girl') || text.includes('mary') || text.includes('miriam') || text.includes('esther')) {
    inferred.push({
      name: 'Girl',
      kind: 'girl',
      action: 'listening',
      mood: 'happy',
      primaryColor: '#EC4899',
      startX: 0.44,
      endX: 0.44,
    });
  } else if (text.includes('boy') || text.includes('child') || text.includes('zacchaeus')) {
    inferred.push({
      name: 'Boy',
      kind: 'boy',
      action: 'listening',
      mood: 'curious',
      primaryColor: '#2563EB',
      startX: 0.44,
      endX: 0.44,
    });
  }

  if (text.includes('lamb') || text.includes('sheep')) {
    inferred.push({
      name: 'Lamb',
      kind: 'lamb',
      action: 'listening',
      mood: 'gentle',
      primaryColor: '#FEF3C7',
      startX: 0.58,
      endX: 0.58,
    });
  }
  if (text.includes('lion')) {
    inferred.push({
      name: 'Lion',
      kind: 'lion',
      action: 'listening',
      mood: 'gentle',
      primaryColor: '#D97706',
      startX: 0.62,
      endX: 0.62,
    });
  }
  if (text.includes('dove') || text.includes('bird')) {
    inferred.push({
      name: 'Dove',
      kind: 'dove',
      action: 'flying',
      mood: 'joyful',
      primaryColor: '#F8FAFC',
      startX: 0.56,
      endX: 0.56,
    });
  }
  if (text.includes('angel')) {
    inferred.push({
      name: 'Angel',
      kind: 'angel',
      action: 'celebrating',
      mood: 'joyful',
      primaryColor: '#FDE68A',
      startX: 0.65,
      endX: 0.65,
    });
  }
  if (text.includes('donkey')) {
    inferred.push({
      name: 'Donkey',
      kind: 'donkey',
      action: 'listening',
      mood: 'gentle',
      primaryColor: '#94A3B8',
      startX: 0.6,
      endX: 0.6,
    });
  }

  return inferred.slice(0, 3);
}

function drawScenicFocusLayer(
  ctx: CanvasRenderingContext2D,
  focus: ScenicFocus,
  scene: StoryScene,
  w: number,
  h: number
) {
  const lighting = TIME_LIGHTING[scene.timeOfDay] ?? TIME_LIGHTING.golden_hour;
  ctx.save();

  switch (focus) {
    case 'rainbow_arc': {
      const cx = w * 0.52;
      const cy = h * 0.68;
      const colors = [
        'rgba(239, 68, 68, 0.36)',
        'rgba(249, 115, 22, 0.36)',
        'rgba(250, 204, 21, 0.36)',
        'rgba(74, 222, 128, 0.34)',
        'rgba(56, 189, 248, 0.36)',
        'rgba(129, 140, 248, 0.32)',
      ];
      colors.forEach((col, idx) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, h * 0.58 - idx * 13, Math.PI * 1.07, Math.PI * 1.93);
        ctx.stroke();
      });
      break;
    }

    case 'wooden_ark': {
      ctx.save();
      ctx.translate(w * 0.68, h * 0.54);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
      ctx.beginPath();
      ctx.ellipse(0, 42, 155, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      const hullGrad = ctx.createLinearGradient(-130, -25, 130, 40);
      hullGrad.addColorStop(0, '#92400E');
      hullGrad.addColorStop(0.55, '#78350F');
      hullGrad.addColorStop(1, '#451A03');
      ctx.fillStyle = hullGrad;
      ctx.strokeStyle = '#291207';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-140, -12);
      ctx.quadraticCurveTo(0, 6, 140, -12);
      ctx.lineTo(106, 36);
      ctx.quadraticCurveTo(0, 46, -106, 36);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#B45309';
      ctx.beginPath();
      ctx.moveTo(-88, -10);
      ctx.lineTo(-78, -46);
      ctx.lineTo(78, -46);
      ctx.lineTo(88, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#78350F';
      ctx.beginPath();
      ctx.moveTo(-94, -44);
      ctx.lineTo(0, -68);
      ctx.lineTo(94, -44);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FDE68A';
      ctx.fillRect(-10, -34, 20, 14);
      ctx.restore();
      break;
    }

    case 'fishing_boat': {
      ctx.save();
      ctx.translate(w * 0.69, h * 0.6);
      ctx.fillStyle = 'rgba(255, 250, 235, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 28, 118, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      const boatGrad = ctx.createLinearGradient(-95, 0, 95, 24);
      boatGrad.addColorStop(0, '#9A5B25');
      boatGrad.addColorStop(1, '#5C3110');
      ctx.fillStyle = boatGrad;
      ctx.strokeStyle = '#26150E';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-98, -4);
      ctx.quadraticCurveTo(0, 14, 98, -6);
      ctx.lineTo(68, 22);
      ctx.quadraticCurveTo(0, 30, -68, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#451A03';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(0, -112);
      ctx.stroke();

      const sailGrad = ctx.createLinearGradient(0, -106, 62, -14);
      sailGrad.addColorStop(0, '#FFFBEB');
      sailGrad.addColorStop(1, '#FDE68A');
      ctx.fillStyle = sailGrad;
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(2, -106);
      ctx.quadraticCurveTo(54, -68, 60, -14);
      ctx.quadraticCurveTo(28, -22, 2, -16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'glowing_star': {
      const sx = w * 0.64;
      const sy = h * 0.21;
      const halo = ctx.createRadialGradient(sx, sy, 4, sx, sy, 190);
      halo.addColorStop(0, 'rgba(255, 251, 214, 0.92)');
      halo.addColorStop(0.25, 'rgba(253, 224, 71, 0.42)');
      halo.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, 190, 0, Math.PI * 2);
      ctx.fill();

      const rayGrad = ctx.createLinearGradient(sx, sy, sx, h * 0.82);
      rayGrad.addColorStop(0, 'rgba(254, 240, 138, 0.34)');
      rayGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(sx - 12, sy);
      ctx.lineTo(sx + 12, sy);
      ctx.lineTo(sx + 130, h * 0.84);
      ctx.lineTo(sx - 130, h * 0.84);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#FFFBEB';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 34);
      ctx.quadraticCurveTo(sx + 4, sy - 4, sx + 32, sy);
      ctx.quadraticCurveTo(sx + 4, sy + 4, sx, sy + 44);
      ctx.quadraticCurveTo(sx - 4, sy + 4, sx - 32, sy);
      ctx.quadraticCurveTo(sx - 4, sy - 4, sx, sy - 34);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'loaves_and_fish': {
      // Woven wicker basket filled with 5 golden bread loaves and 2 silvery-blue fish
      ctx.save();
      ctx.translate(w * 0.56, h * 0.77);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.beginPath();
      ctx.ellipse(0, 28, 72, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Linen cloth underneath
      ctx.fillStyle = '#FEF3C7';
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 18, 68, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 5 warm golden loaves
      const loafPositions = [
        [-28, -4],
        [0, -10],
        [26, -3],
        [-14, 4],
        [15, 5],
      ];
      loafPositions.forEach(([lx, ly]) => {
        const lg = ctx.createLinearGradient(lx - 14, ly - 10, lx + 14, ly + 8);
        lg.addColorStop(0, '#FBBF24');
        lg.addColorStop(1, '#B45309');
        ctx.fillStyle = lg;
        ctx.strokeStyle = '#451A03';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 16, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // 2 silvery-blue fish resting on the cloth
      [
        [34, 16, -0.2],
        [-32, 17, 0.2],
      ].forEach(([fx, fy, rot]) => {
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(rot);
        ctx.fillStyle = '#93C5FD';
        ctx.strokeStyle = '#1E3A8A';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-16, 0);
        ctx.lineTo(-26, -7);
        ctx.lineTo(-26, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      // Wicker basket bowl front
      const basketGrad = ctx.createLinearGradient(-46, 0, 46, 26);
      basketGrad.addColorStop(0, '#D97706');
      basketGrad.addColorStop(1, '#78350F');
      ctx.fillStyle = basketGrad;
      ctx.strokeStyle = '#291207';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-48, 2);
      ctx.quadraticCurveTo(0, 14, 48, 2);
      ctx.lineTo(36, 28);
      ctx.quadraticCurveTo(0, 34, -36, 28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'golden_harp': {
      ctx.save();
      ctx.translate(w * 0.25, h * 0.74);
      // Mossy rock base
      ctx.fillStyle = '#64748B';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 18, 42, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Golden wooden frame harp
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-16, 12);
      ctx.quadraticCurveTo(-24, -46, 12, -56);
      ctx.quadraticCurveTo(28, -32, 14, 12);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 1.4;
      for (let s = -10; s <= 12; s += 5) {
        ctx.beginPath();
        ctx.moveTo(s, -44 + Math.abs(s) * 0.6);
        ctx.lineTo(s * 0.8, 10);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case 'manger_cradle': {
      ctx.save();
      ctx.translate(w * 0.56, h * 0.77);
      const glow = ctx.createRadialGradient(0, -16, 4, 0, -16, 95);
      glow.addColorStop(0, 'rgba(254, 240, 138, 0.72)');
      glow.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, -16, 95, 0, Math.PI * 2);
      ctx.fill();

      // Golden hay
      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = '#854D0E';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, -8, 44, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Crossed timber manger
      ctx.strokeStyle = '#5C3110';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-36, 26);
      ctx.lineTo(28, -10);
      ctx.moveTo(36, 26);
      ctx.lineTo(-28, -10);
      ctx.stroke();

      ctx.fillStyle = '#92400E';
      ctx.strokeStyle = '#291207';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-42, -8);
      ctx.lineTo(42, -8);
      ctx.lineTo(30, 14);
      ctx.lineTo(-30, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'sycamore_tree': {
      ctx.save();
      ctx.fillStyle = '#5C3A21';
      ctx.strokeStyle = '#26150E';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(w * 0.83, h);
      ctx.quadraticCurveTo(w * 0.8, h * 0.64, w * 0.77, h * 0.36);
      ctx.lineTo(w * 0.83, h * 0.35);
      ctx.quadraticCurveTo(w * 0.88, h * 0.66, w * 0.92, h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const leafGrad = ctx.createRadialGradient(w * 0.76, h * 0.3, 25, w * 0.79, h * 0.32, 220);
      leafGrad.addColorStop(0, '#84CC16');
      leafGrad.addColorStop(0.6, '#3F6212');
      leafGrad.addColorStop(1, '#1A2E05');
      ctx.fillStyle = leafGrad;
      ctx.beginPath();
      ctx.ellipse(w * 0.78, h * 0.28, 210, 118, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'stone_well': {
      ctx.save();
      ctx.translate(w * 0.75, h * 0.73);
      ctx.fillStyle = '#94A3B8';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.rect(-46, -18, 92, 46);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.ellipse(0, -18, 48, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#5C3415';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-36, -18);
      ctx.lineTo(-36, -86);
      ctx.lineTo(36, -86);
      ctx.lineTo(36, -18);
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'lions_den': {
      ctx.save();
      const archGrad = ctx.createLinearGradient(w * 0.58, h * 0.25, w * 0.92, h * 0.78);
      archGrad.addColorStop(0, '#475569');
      archGrad.addColorStop(1, '#1E293B');
      ctx.fillStyle = archGrad;
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.64, h * 0.78);
      ctx.quadraticCurveTo(w * 0.77, h * 0.24, w * 0.95, h * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const beam = ctx.createRadialGradient(w * 0.78, h * 0.56, 8, w * 0.78, h * 0.56, 150);
      beam.addColorStop(0, 'rgba(254, 240, 138, 0.42)');
      beam.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.arc(w * 0.78, h * 0.56, 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'shepherd_hills': {
      ctx.save();
      ctx.fillStyle = '#94A3B8';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 8; i++) {
        const bx = w * 0.64 + i * 32;
        const by = h * 0.72 + Math.sin(i * 0.6) * 5;
        ctx.beginPath();
        ctx.ellipse(bx, by, 18, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      const px = w * 0.19;
      const py = h * 0.76;
      ctx.strokeStyle = '#5C3415';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - 125);
      ctx.lineTo(px + 28, py - 125);
      ctx.stroke();
      const lg = ctx.createRadialGradient(px + 28, py - 108, 2, px + 28, py - 108, 42);
      lg.addColorStop(0, 'rgba(253, 224, 71, 0.85)');
      lg.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(px + 28, py - 108, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'stone_bridge': {
      ctx.save();
      ctx.translate(w * 0.56, h * 0.68);
      const stoneGrad = ctx.createLinearGradient(0, -40, 0, 40);
      stoneGrad.addColorStop(0, '#CBD5E1');
      stoneGrad.addColorStop(1, '#64748B');
      ctx.fillStyle = stoneGrad;
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-165, 36);
      ctx.quadraticCurveTo(0, -48, 165, 36);
      ctx.lineTo(132, 46);
      ctx.quadraticCurveTo(0, -8, -132, 46);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'olive_tree': {
      ctx.save();
      ctx.fillStyle = '#5C3A21';
      ctx.strokeStyle = '#26150E';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(w * 0.94, h);
      ctx.quadraticCurveTo(w * 0.89, h * 0.68, w * 0.85, h * 0.42);
      ctx.lineTo(w * 0.89, h * 0.41);
      ctx.quadraticCurveTo(w * 0.96, h * 0.68, w + 10, h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const canopyGrad = ctx.createRadialGradient(w * 0.84, h * 0.34, 20, w * 0.86, h * 0.36, 190);
      canopyGrad.addColorStop(0, '#84CC16');
      canopyGrad.addColorStop(0.55, '#4D7C0F');
      canopyGrad.addColorStop(1, '#365314');
      ctx.fillStyle = canopyGrad;
      ctx.beginPath();
      ctx.ellipse(w * 0.85, h * 0.32, 165, 95, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'flower_arch': {
      const petals = ['#F472B6', '#FBBF24', '#FB7185', '#C084FC', '#FFFFFF'];
      for (let i = 0; i < 24; i++) {
        const fx = (i < 12 ? 0.04 + i * 0.028 : 0.64 + (i - 12) * 0.028) * w;
        const fy = h * (0.82 + ((i * 37) % 14) / 100);
        ctx.fillStyle = '#15803D';
        ctx.beginPath();
        ctx.ellipse(fx, fy + 10, 8, 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = petals[i % petals.length];
        ctx.beginPath();
        ctx.arc(fx, fy, 6 + (i % 3) * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.arc(fx, fy, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'lantern_village': {
      [0.24, 0.5, 0.78].forEach((rx, idx) => {
        const lx = w * rx;
        const ly = h * (0.58 + (idx % 2) * 0.06);
        const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 65);
        glow.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
        glow.addColorStop(0.4, 'rgba(251, 146, 60, 0.34)');
        glow.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(lx, ly, 65, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }

    case 'desert_palms': {
      const baseX = w * 0.16;
      const baseY = h * 0.78;
      ctx.strokeStyle = '#5C3A21';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(baseX + 26, baseY - 140, baseX + 18, baseY - 255);
      ctx.stroke();
      ctx.fillStyle = '#3F6212';
      [-2.4, -1.6, -0.7, 0.2, 0.9].forEach((ang) => {
        ctx.save();
        ctx.translate(baseX + 18, baseY - 255);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(46, 0, 54, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      break;
    }

    case 'mountain_sunrise': {
      const sunX = w * 0.5;
      const sunY = h * 0.34;
      const glow = ctx.createRadialGradient(sunX, sunY, 12, sunX, sunY, 260);
      glow.addColorStop(0, lighting.sunCore);
      glow.addColorStop(0.35, lighting.sunGlow);
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 260, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'none':
    default:
      break;
  }

  ctx.restore();
}

function paintSceneIllustrationPlate(scene: StoryScene): HTMLCanvasElement {
  const plate = document.createElement('canvas');
  plate.width = PLATE_W;
  plate.height = PLATE_H;
  const ctx = plate.getContext('2d');
  if (!ctx) return plate;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const lighting = TIME_LIGHTING[scene.timeOfDay] ?? TIME_LIGHTING.golden_hour;
  const grainPattern = getPainterlyGrainPattern(ctx);

  // 1. Hand-painted concept-art backdrop matching the scene environment
  const backdropImg = getBackdropImage(scene.environment);
  if (backdropImg) {
    const imgRatio = backdropImg.naturalWidth / backdropImg.naturalHeight;
    const targetRatio = PLATE_W / PLATE_H;
    let drawW = PLATE_W;
    let drawH = PLATE_H;
    if (imgRatio > targetRatio) {
      drawW = drawH * imgRatio;
    } else {
      drawH = drawW / imgRatio;
    }
    const dx = (PLATE_W - drawW) / 2;
    const dy = (PLATE_H - drawH) / 2;
    ctx.drawImage(backdropImg, dx, dy, drawW, drawH);
  } else {
    ctx.save();
    ctx.scale(PLATE_W / WIDTH, PLATE_H / HEIGHT);
    drawPaintedFallbackBackdrop(ctx, scene, lighting, scene.sceneNumber * 1.7);
    ctx.restore();
  }

  // 2. Time-of-day atmospheric sky tint & stars if twilight/starlight
  if (scene.timeOfDay === 'starlight' || scene.timeOfDay === 'twilight') {
    ctx.save();
    ctx.fillStyle =
      scene.timeOfDay === 'starlight'
        ? 'rgba(11, 17, 32, 0.36)'
        : 'rgba(30, 27, 75, 0.24)';
    ctx.fillRect(0, 0, PLATE_W, PLATE_H);
    for (let i = 0; i < 42; i++) {
      const sx = (i * 197 + scene.sceneNumber * 53) % PLATE_W;
      const sy = (i * 61 + scene.sceneNumber * 19) % (PLATE_H * 0.36);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.beginPath();
      ctx.arc(sx, sy, (i % 2) + 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 3. Story-matched props & scenic focal illustrations directly from narration + imagePrompt
  const propsToDraw = collectSceneStoryProps(scene);
  for (const prop of propsToDraw) {
    drawScenicFocusLayer(ctx, prop, scene, PLATE_W, PLATE_H);
  }

  // 4. Static illustrated storybook characters & animals baked directly into the scene image
  //    (zero character animation or movement — fixed storybook pose depicting the exact storyline)
  const staticCharacters = resolveStaticSceneCharacters(scene);
  if (staticCharacters.length > 0) {
    ctx.save();
    ctx.scale(PLATE_W / WIDTH, PLATE_H / HEIGHT);
    staticCharacters.forEach((char, idx) => {
      const clampedX = Math.max(0.16, Math.min(0.84, char.startX || 0.36 + idx * 0.16));
      const cx = clampedX * WIDTH;
      const cy =
        char.kind === 'fish'
          ? 635
          : scene.environment === 'waterfront'
          ? 644
          : 648;
      drawCharacter(ctx, {
        character: { ...char, endX: clampedX },
        x: cx,
        y: cy,
        sceneWidth: WIDTH,
        globalTime: 0.35 + idx * 0.2,
        sceneProgress: 0.5,
        speechAmp: 0,
        lighting,
        grainPattern,
      });
    });
    ctx.restore();
  }

  // 5. Atmospheric particles & storybook color grade baked cleanly into scene image
  ctx.save();
  ctx.scale(PLATE_W / WIDTH, PLATE_H / HEIGHT);
  drawAtmosphericParticles(ctx, scene, lighting, scene.sceneNumber * 1.4);
  ctx.restore();

  return plate;
}

export async function generateSceneIllustrations(
  story: GeneratedStory,
  onProgress?: (pct: number) => void
): Promise<HTMLCanvasElement[]> {
  const promptSig = story.scenes
    .map((s) => `${s.sceneNumber}:${(s.imagePrompt || s.narration || '').slice(0, 24)}:${s.characters?.length ?? 0}`)
    .join('|');
  const cacheKey = `${story.id}:${promptSig}`;
  const cached = scenePlateCache.get(cacheKey);
  if (cached && cached.length === story.scenes.length) {
    onProgress?.(100);
    return cached;
  }

  await preloadEnvironmentBackdrops(story.scenes);
  const plates: HTMLCanvasElement[] = [];

  for (let i = 0; i < story.scenes.length; i++) {
    plates.push(paintSceneIllustrationPlate(story.scenes[i]));
    onProgress?.(Math.round(((i + 1) / Math.max(1, story.scenes.length)) * 100));
  }

  scenePlateCache.set(cacheKey, plates);
  return plates;
}

function drawKenBurnsPlate(
  ctx: CanvasRenderingContext2D,
  plate: HTMLCanvasElement,
  scene: StoryScene,
  progress: number,
  alpha = 1
) {
  const eased = easeInOut(progress);
  let camScale = 1.04;
  let camX = 0;
  let camY = 0;

  switch (scene.cameraMove) {
    case 'zoom_in':
      camScale = lerp(1.0, 1.09, eased);
      break;
    case 'zoom_out':
      camScale = lerp(1.09, 1.0, eased);
      break;
    case 'pan_right':
      camScale = 1.07;
      camX = lerp(34, -34, eased);
      break;
    case 'pan_left':
      camScale = 1.07;
      camX = lerp(-34, 34, eased);
      break;
    case 'crane_up':
      camScale = 1.07;
      camY = lerp(20, -18, eased);
      break;
    case 'dolly_follow':
      camScale = 1.06;
      camX = lerp(24, -24, eased);
      break;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(WIDTH / 2 + camX, HEIGHT / 2 + camY);
  ctx.scale(camScale, camScale);
  ctx.translate(-WIDTH / 2, -HEIGHT / 2);
  ctx.drawImage(plate, 0, 0, WIDTH, HEIGHT);
  ctx.restore();
}

export function renderImageSlideshowFrame(
  ctx: CanvasRenderingContext2D,
  story: GeneratedStory,
  scenePlates: HTMLCanvasElement[],
  timeSec: number,
  totalDurationSec: number
) {
  const scenes = story.scenes;
  if (!scenes.length || !scenePlates.length) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const { scene, sceneIdx, sceneLocalTime, sceneProgress } =
    resolveActiveSceneAtTime(story, timeSec, totalDurationSec);

  const currentPlate = scenePlates[Math.min(scenePlates.length - 1, sceneIdx)];
  const prevPlate =
    sceneIdx > 0 ? scenePlates[Math.min(scenePlates.length - 1, sceneIdx - 1)] : null;

  const transitionDur = 0.75;
  if (prevPlate && sceneLocalTime < transitionDur) {
    const tp = easeInOut(sceneLocalTime / transitionDur);
    drawKenBurnsPlate(ctx, prevPlate, scenes[sceneIdx - 1], 1, 1);

    if (scene.transitionIn === 'wipe_horizon') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, WIDTH * tp, HEIGHT);
      ctx.clip();
      drawKenBurnsPlate(ctx, currentPlate, scene, sceneProgress, 1);
      ctx.restore();
    } else if (scene.transitionIn === 'iris_open') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(WIDTH / 2, HEIGHT / 2, tp * WIDTH * 0.72, 0, Math.PI * 2);
      ctx.clip();
      drawKenBurnsPlate(ctx, currentPlate, scene, sceneProgress, 1);
      ctx.restore();
    } else {
      drawKenBurnsPlate(ctx, currentPlate, scene, sceneProgress, tp);
    }
  } else {
    drawKenBurnsPlate(ctx, currentPlate, scene, sceneProgress, 1);
  }

  // Soft storybook vignette
  const vig = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT / 2,
    WIDTH * 0.36,
    WIDTH / 2,
    HEIGHT / 2,
    WIDTH * 0.74
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(15, 23, 42, 0.24)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawTitleAndMoralOverlays(ctx, story, timeSec, totalDurationSec);
}

export async function renderSlideshowVideo(
  story: GeneratedStory,
  mixedAudio: AudioBuffer,
  speechTimeline: Float32Array,
  totalDurationSec: number,
  onProgress: (pct: number) => void
): Promise<{ blob: Blob; mimeType: string }> {
  const scenePlates = await generateSceneIllustrations(story);

  return encodeCanvasVideo(
    (ctx, timeSec) =>
      renderImageSlideshowFrame(ctx, story, scenePlates, timeSec, totalDurationSec),
    mixedAudio,
    speechTimeline,
    totalDurationSec,
    onProgress
  );
}
