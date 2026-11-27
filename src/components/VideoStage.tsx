import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Film,
  Loader2,
  Maximize2,
  Music,
  Pause,
  Play,
  RefreshCw,
  Volume2,
} from 'lucide-react';
import type { GeneratedStory, VideoStatus } from '../types/story';
import { preloadEnvironmentBackdrops, renderStoryFrame } from '../lib/animationRenderer';
import {
  generateSceneIllustrations,
  renderImageSlideshowFrame,
} from '../lib/imageStoryRenderer';
import type { UI_COPY } from '../lib/i18n';

interface VideoStageProps {
  story: GeneratedStory | null;
  videoUrl: string | null;
  videoMimeType: string;
  narrationUrl: string | null;
  musicUrl: string | null;
  status: VideoStatus;
  stageLabel: string;
  progress: number;
  durationSeconds: number;
  errorMessage: string | null;
  copy: (typeof UI_COPY)['en'];
  onRegenerateStory: () => void;
  onRegenerateVideo: () => void;
  onContinueMusicOnly?: () => void;
  onDownloadScript: () => void;
}

const MEADOW_ART_URL = '/src/assets/images/storybook_meadow_stage_1795731495058.jpg';

function formatDuration(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function VideoStage({
  story,
  videoUrl,
  videoMimeType,
  narrationUrl,
  musicUrl,
  status,
  stageLabel,
  progress,
  durationSeconds,
  errorMessage,
  copy,
  onRegenerateStory,
  onRegenerateVideo,
  onContinueMusicOnly,
  onDownloadScript,
}: VideoStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Animate preview canvas while Processing or when story exists without compiled blob
  useEffect(() => {
    if (!story || (videoUrl && status === 'Completed')) return;
    let cancelled = false;
    let rafId = 0;
    const start = performance.now();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (story.videoMode === 'image_slideshow') {
      void generateSceneIllustrations(story).then((plates) => {
        if (cancelled) return;
        const loop = () => {
          if (cancelled) return;
          const dur = Math.max(18, story.estimatedDurationSec);
          const elapsed = ((performance.now() - start) / 1000) % dur;
          renderImageSlideshowFrame(ctx, story, plates, elapsed, dur);
          rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
      });
    } else {
      void preloadEnvironmentBackdrops(story.scenes);
      const loop = () => {
        if (cancelled) return;
        const dur = Math.max(18, story.estimatedDurationSec);
        const elapsed = ((performance.now() - start) / 1000) % dur;
        const amp = 0.25 + Math.abs(Math.sin(elapsed * 4.2)) * 0.45;
        renderStoryFrame(ctx, story, elapsed, dur, amp);
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [story, videoUrl, status]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    vid.addEventListener('play', handlePlay);
    vid.addEventListener('pause', handlePause);
    vid.addEventListener('ended', handlePause);
    return () => {
      vid.removeEventListener('play', handlePlay);
      vid.removeEventListener('pause', handlePause);
      vid.removeEventListener('ended', handlePause);
    };
  }, [videoUrl]);

  const togglePlayPause = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  };

  const handleFullscreen = () => {
    const target = videoRef.current || containerRef.current;
    if (!target) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (target.requestFullscreen) {
      target.requestFullscreen().catch(() => {});
    }
  };

  const videoExt = videoMimeType.includes('mp4') ? 'mp4' : 'webm';
  const safeSlug = (story?.title || 'bible-kids-story')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'bible-kids-story';

  const isBusy = status === 'Generating' || status === 'Processing';

  return (
    <section
      id="studio"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 shadow-xs"
    >
      {/* 16:9 Main Stage */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950"
      >
        {videoUrl && status === 'Completed' ? (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            className="h-full w-full object-contain bg-black"
          />
        ) : story ? (
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="h-full w-full object-cover"
          />
        ) : !imgError ? (
          <img
            src={MEADOW_ART_URL}
            alt="Sunlit Bible storybook meadow stage"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-900 via-indigo-900 to-slate-900">
            <Film className="h-16 w-16 text-violet-300/60" />
          </div>
        )}

        {/* Idle Welcome Scrim */}
        {!story && !isBusy && status !== 'Failed' && (
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent p-6 md:p-8">
            <div className="max-w-2xl">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white [text-wrap:balance]">
                {copy.emptyStageTitle}
              </h1>
              <p className="mt-2 text-sm md:text-base text-slate-200 leading-relaxed">
                {copy.emptyStageSubtitle}
              </p>
            </div>
          </div>
        )}

        {/* Live Progress Overlay while Generating / Processing */}
        {isBusy && (
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent p-6">
            <div className="max-w-xl rounded-xl border border-white/15 bg-slate-950/80 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between gap-4 text-sm font-semibold text-white">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                  <span>{stageLabel}</span>
                </span>
                <span className="font-mono tabular-nums text-violet-300">
                  {progress}%
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${Math.max(4, progress)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {status === 'Failed' && errorMessage && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-6">
            <div className="max-w-lg rounded-xl border border-rose-500/40 bg-slate-900 p-5 text-white">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <h2 className="text-base font-semibold">Generation Failed</h2>
                  <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                    {errorMessage}
                  </p>
                  {story &&
                    onContinueMusicOnly &&
                    (errorMessage.includes('429') ||
                      errorMessage.toLowerCase().includes('rate limit') ||
                      errorMessage.toLowerCase().includes('quota')) && (
                      <button
                        type="button"
                        onClick={onContinueMusicOnly}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors"
                      >
                        <Music className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Render Story with Music Only (Skip Voice)</span>
                      </button>
                    )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Player & Export Action Toolbar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!videoUrl || status !== 'Completed'}
            onClick={togglePlayPause}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 hover:bg-violet-800 disabled:opacity-45 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{isPlaying ? copy.pause : copy.play}</span>
          </button>

          <button
            type="button"
            disabled={!story}
            onClick={handleFullscreen}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-45 disabled:cursor-not-allowed px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
            <span>{copy.fullscreen}</span>
          </button>

          {videoUrl && (
            <a
              href={videoUrl}
              download={`${safeSlug}.${videoExt}`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />
              <span>{copy.downloadVideo}</span>
            </a>
          )}

          {narrationUrl && (
            <a
              href={narrationUrl}
              download={`${safeSlug}-narration.wav`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              <span>{copy.downloadAudio}</span>
            </a>
          )}

          {musicUrl && (
            <a
              href={musicUrl}
              download={`${safeSlug}-music.wav`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <Music className="h-4 w-4" aria-hidden="true" />
              <span>{copy.downloadMusic}</span>
            </a>
          )}

          {story && (
            <button
              type="button"
              onClick={onDownloadScript}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              <span>{copy.downloadScript}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {story && (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={onRegenerateStory}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>{copy.regenerateStory}</span>
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={onRegenerateVideo}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                <Film className="h-4 w-4" aria-hidden="true" />
                <span>{copy.regenerateVideo}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Video Status & Metadata Strip (Clean Unboxed Typography with Separators) */}
      <div className="mt-5 border-t border-slate-200 dark:border-slate-800 pt-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {copy.statusLabel}
            </div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold">
              {status === 'Completed' && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              )}
              {(status === 'Generating' || status === 'Processing') && (
                <Loader2 className="h-4 w-4 animate-spin text-violet-600 dark:text-violet-400" />
              )}
              {status === 'Failed' && (
                <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              )}
              <span
                className={
                  status === 'Completed'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : status === 'Failed'
                    ? 'text-rose-700 dark:text-rose-400'
                    : isBusy
                    ? 'text-violet-700 dark:text-violet-400'
                    : 'text-slate-700 dark:text-slate-300'
                }
              >
                {status}
              </span>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {copy.titleLabel}
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {story?.title || '—'}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {copy.languageLabel} / {copy.durationLabel}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <span>{story?.language || '—'}</span>
              {story && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="text-xs font-medium text-violet-700 dark:text-violet-400">
                    {story.videoMode === 'image_slideshow'
                      ? copy.imageStoryModeLabel
                      : copy.animatedModeLabel}
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-slate-400">
                ·
              </span>
              <span className="font-mono tabular-nums">
                {formatDuration(durationSeconds || story?.estimatedDurationSec || 0)}
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {copy.createdLabel}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300 tabular-nums">
              {formatDate(story?.createdAt)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
