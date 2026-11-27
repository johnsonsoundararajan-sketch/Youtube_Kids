import type { MusicProfile } from '../types/story';

const SCALES: Record<MusicProfile['key'], number[]> = {
  // Pentatonic + warm major 7th frequencies in Hz (C4..C6)
  C_major: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0],
  G_major: [196.0, 220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25],
  F_major: [174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25, 587.33],
};

// Chord progressions in scale indices (I - V - vi - IV)
const CHORD_PROGRESSIONS: number[][] = [
  [0, 2, 3, 5], // I
  [3, 4, 6, 8], // V-ish open voicing
  [4, 5, 7, 9], // vi
  [1, 3, 5, 7], // IV/ii warm suspension
];

export function encodeAudioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export async function decodeAudioDataUrl(dataUrl: string): Promise<{
  buffer: AudioBuffer;
  blob: Blob;
}> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return { buffer, blob };
  } finally {
    await ctx.close();
  }
}

export function computeAmplitudeTimeline(
  narrationBuffer: AudioBuffer,
  fps = 24,
  introOffsetSec = 1.0,
  totalDurationSec?: number
): Float32Array {
  const duration = totalDurationSec ?? narrationBuffer.duration + 3.0;
  const totalFrames = Math.ceil(duration * fps);
  const timeline = new Float32Array(totalFrames);
  const channel = narrationBuffer.getChannelData(0);
  const sr = narrationBuffer.sampleRate;

  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps - introOffsetSec;
    if (t < 0 || t >= narrationBuffer.duration) {
      timeline[f] = 0;
      continue;
    }
    const startSample = Math.floor(t * sr);
    const windowSize = Math.floor(sr / fps);
    const endSample = Math.min(channel.length, startSample + windowSize);
    let sumSq = 0;
    for (let s = startSample; s < endSample; s++) {
      const v = channel[s];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, endSample - startSample));
    timeline[f] = Math.min(1, rms * 4.5);
  }

  return timeline;
}

export function createSilentNarrationTrack(durationSec: number): {
  buffer: AudioBuffer;
  blob: Blob;
} {
  const safeDuration = Math.max(12, Math.min(300, durationSec));
  const sampleRate = 24000;
  const ctx = new OfflineAudioContext(1, Math.ceil(safeDuration * sampleRate), sampleRate);
  const buffer = ctx.createBuffer(1, Math.ceil(safeDuration * sampleRate), sampleRate);
  const blob = encodeAudioBufferToWav(buffer);
  return { buffer, blob };
}

export async function generateBalancedSoundtrack(
  narrationBuffer: AudioBuffer,
  musicProfile: MusicProfile
): Promise<{
  mixedBuffer: AudioBuffer;
  musicOnlyBlob: Blob;
  totalDurationSec: number;
  introOffsetSec: number;
}> {
  const sampleRate = 44100;
  const introOffsetSec = 1.0;
  const outroSec = 2.4;
  const totalDurationSec = narrationBuffer.duration + introOffsetSec + outroSec;
  const totalSamples = Math.ceil(totalDurationSec * sampleRate);

  const scale = SCALES[musicProfile.key] ?? SCALES.C_major;
  const bpm = Math.max(68, Math.min(104, musicProfile.tempoBpm || 82));
  const beatSec = 60 / bpm;
  const barSec = beatSec * 4;

  // 1. Synthesize soft, magical, inspirational kids storytelling background music
  const musicCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
  const musicMaster = musicCtx.createGain();
  musicMaster.gain.value = 0.72;

  const lowpass = musicCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3400;
  lowpass.Q.value = 0.6;

  musicMaster.connect(lowpass);
  lowpass.connect(musicCtx.destination);

  // Subtle stereo shimmer delay
  const delayL = musicCtx.createDelay();
  const delayR = musicCtx.createDelay();
  delayL.delayTime.value = beatSec * 0.5;
  delayR.delayTime.value = beatSec * 0.75;
  const delayGain = musicCtx.createGain();
  delayGain.gain.value = 0.18;
  delayL.connect(delayGain);
  delayR.connect(delayGain);
  delayGain.connect(musicMaster);

  const totalBars = Math.ceil(totalDurationSec / barSec);

  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * barSec;
    const chord = CHORD_PROGRESSIONS[bar % CHORD_PROGRESSIONS.length];
    const barEnd = Math.min(totalDurationSec - 0.3, barStart + barSec);
    if (barEnd <= barStart + 0.2) break;

    // Warm string/pad swell per bar
    for (let n = 0; n < 3; n++) {
      const freq = scale[chord[n]] * 0.5;
      const osc = musicCtx.createOscillator();
      const g = musicCtx.createGain();
      osc.type = n === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, barStart);

      g.gain.setValueAtTime(0.0001, barStart);
      g.gain.linearRampToValueAtTime(0.075, barStart + barSec * 0.3);
      g.gain.linearRampToValueAtTime(0.055, barEnd - 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, barEnd);

      osc.connect(g);
      g.connect(musicMaster);
      osc.start(barStart);
      osc.stop(barEnd + 0.05);
    }

    // Gentle harp / celesta 8th-note arpeggio
    const steps = 8;
    const stepSec = barSec / steps;
    for (let s = 0; s < steps; s++) {
      const noteTime = barStart + s * stepSec;
      if (noteTime >= totalDurationSec - 0.8) break;
      const noteIdx = chord[(s + (bar % 2)) % chord.length];
      const freq = scale[noteIdx] * (s % 4 === 3 ? 2 : 1);

      const bell = musicCtx.createOscillator();
      const bellGain = musicCtx.createGain();
      const panner = musicCtx.createStereoPanner();
      panner.pan.value = s % 2 === 0 ? -0.25 : 0.25;

      bell.type = 'sine';
      bell.frequency.setValueAtTime(freq, noteTime);

      const peak = s % 2 === 0 ? 0.11 : 0.07;
      bellGain.gain.setValueAtTime(0.0001, noteTime);
      bellGain.gain.linearRampToValueAtTime(peak, noteTime + 0.02);
      bellGain.gain.exponentialRampToValueAtTime(0.0001, noteTime + stepSec * 1.6);

      bell.connect(bellGain);
      bellGain.connect(panner);
      panner.connect(musicMaster);
      panner.connect(s % 2 === 0 ? delayL : delayR);

      bell.start(noteTime);
      bell.stop(noteTime + stepSec * 1.8);
    }

    // Soft inspirational flute motif on odd bars
    if (bar % 2 === 1 && musicProfile.mood !== 'peaceful_lullaby') {
      const motifNotes = [chord[2], chord[3], chord[1], chord[2]];
      for (let m = 0; m < motifNotes.length; m++) {
        const mTime = barStart + m * beatSec;
        if (mTime >= totalDurationSec - 1.0) break;
        const mEnd = Math.min(totalDurationSec - 0.5, mTime + beatSec * 0.9);
        const flute = musicCtx.createOscillator();
        const fGain = musicCtx.createGain();
        flute.type = 'sine';
        flute.frequency.setValueAtTime(scale[motifNotes[m]], mTime);

        fGain.gain.setValueAtTime(0.0001, mTime);
        fGain.gain.linearRampToValueAtTime(0.065, mTime + 0.12);
        fGain.gain.exponentialRampToValueAtTime(0.0001, mEnd);

        flute.connect(fGain);
        fGain.connect(musicMaster);
        flute.start(mTime);
        flute.stop(mEnd + 0.05);
      }
    }
  }

  // Global fade-in & fade-out on music
  musicMaster.gain.setValueAtTime(0.001, 0);
  musicMaster.gain.linearRampToValueAtTime(0.75, Math.min(1.2, totalDurationSec * 0.15));
  musicMaster.gain.setValueAtTime(0.75, Math.max(1.2, totalDurationSec - 2.2));
  musicMaster.gain.linearRampToValueAtTime(0.0001, totalDurationSec - 0.05);

  const musicBuffer = await musicCtx.startRendering();
  const musicOnlyBlob = encodeAudioBufferToWav(musicBuffer);

  // 2. Mix narration + auto-ducked music into final balanced track
  const mixCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

  const narrationSrc = mixCtx.createBufferSource();
  narrationSrc.buffer = narrationBuffer;
  const narrationGain = mixCtx.createGain();
  narrationGain.gain.value = 1.05;
  narrationSrc.connect(narrationGain);
  narrationGain.connect(mixCtx.destination);
  narrationSrc.start(introOffsetSec);

  const musicSrc = mixCtx.createBufferSource();
  musicSrc.buffer = musicBuffer;
  const duckGain = mixCtx.createGain();

  // Compute 100ms RMS envelope for automatic voice-music ducking
  const narSamples = narrationBuffer.getChannelData(0);
  const windowSamples = Math.floor(narrationBuffer.sampleRate * 0.1);
  duckGain.gain.setValueAtTime(0.45, 0);

  for (let i = 0; i < narSamples.length; i += windowSamples) {
    const end = Math.min(narSamples.length, i + windowSamples);
    let sumSq = 0;
    for (let j = i; j < end; j++) {
      sumSq += narSamples[j] * narSamples[j];
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - i));
    const timeAt = introOffsetSec + i / narrationBuffer.sampleRate;
    const targetMusicLevel = rms > 0.018 ? 0.16 : 0.4;
    duckGain.gain.setTargetAtTime(targetMusicLevel, timeAt, 0.12);
  }
  duckGain.gain.setTargetAtTime(0.45, introOffsetSec + narrationBuffer.duration, 0.25);

  musicSrc.connect(duckGain);
  duckGain.connect(mixCtx.destination);
  musicSrc.start(0);

  const mixedBuffer = await mixCtx.startRendering();

  return {
    mixedBuffer,
    musicOnlyBlob,
    totalDurationSec,
    introOffsetSec,
  };
}
