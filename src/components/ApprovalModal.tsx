import { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Loader2,
  Mic,
  Send,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import type {
  GeneratedStory,
  PublishPayload,
  PublishResult,
  StoryLanguage,
  VoiceOption,
  YouTubeMetadata,
} from '../types/story';
import type { UI_COPY } from '../lib/i18n';

interface ApprovalModalProps {
  isOpen: boolean;
  story: GeneratedStory;
  durationSeconds: number;
  videoUrl: string | null;
  initialMetadata?: YouTubeMetadata;
  copy: (typeof UI_COPY)['en'];
  onClose: () => void;
  onMetadataReady: (meta: YouTubeMetadata) => void;
  onPublished: (result: PublishResult) => void;
}

const TIMEZONES = [
  'America/Los_Angeles',
  'America/New_York',
  'America/Chicago',
  'Europe/London',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

const VOICE_OPTIONS: VoiceOption[] = [
  'Cute Narrator',
  'Girl Character',
  'Boy Character',
  'Animal Character',
];

export function ApprovalModal({
  isOpen,
  story,
  durationSeconds,
  videoUrl,
  initialMetadata,
  copy,
  onClose,
  onMetadataReady,
  onPublished,
}: ApprovalModalProps) {
  const [metadata, setMetadata] = useState<YouTubeMetadata | null>(
    initialMetadata ?? null
  );
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Scheduling state
  const tomorrow = new Date(Date.now() + 86_400_000)
    .toISOString()
    .split('T')[0];
  const [scheduledDate, setScheduledDate] = useState(tomorrow);
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const localTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
  const [timezone, setTimezone] = useState(
    TIMEZONES.includes(localTz) ? localTz : 'UTC'
  );

  // Voice Preview state
  const [previewSpeaker, setPreviewSpeaker] = useState<VoiceOption>(
    story.voiceOption
  );
  const [previewLang, setPreviewLang] = useState<StoryLanguage>(story.language);
  const [previewText, setPreviewText] = useState(
    story.scenes[0]?.narrationSegment || story.narrationScript.slice(0, 220)
  );
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPreviewSpeaker(story.voiceOption);
    setPreviewLang(story.language);
    setPreviewText(
      story.scenes[0]?.narrationSegment || story.narrationScript.slice(0, 220)
    );
    setPublishResult(null);
    setUploadError(null);

    if (initialMetadata) {
      setMetadata(initialMetadata);
      return;
    }

    let cancelled = false;
    setLoadingMeta(true);
    setMetaError(null);

    fetch('/api/youtube/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: story.title,
        bibleReference: story.bibleReference,
        moralLesson: story.moralLesson,
        narrationScript: story.narrationScript,
        language: story.language,
        durationSeconds: durationSeconds || story.estimatedDurationSec,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate metadata');
        return data as YouTubeMetadata;
      })
      .then((data) => {
        if (!cancelled) {
          setMetadata(data);
          onMetadataReady(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMetaError(
            err instanceof Error ? err.message : 'Failed to generate metadata'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, story.id]);

  if (!isOpen) return null;

  const handleCopyMetadata = async () => {
    if (!metadata) return;
    const text = [
      `TITLE: ${metadata.title}`,
      `CATEGORY: ${metadata.category}`,
      `TARGET AUDIENCE: ${metadata.targetAudience}`,
      `ESTIMATED DURATION: ${metadata.estimatedDuration}`,
      '',
      'DESCRIPTION:',
      metadata.description,
      '',
      `HASHTAGS: ${metadata.hashtags.join(' ')}`,
      '',
      `KEYWORDS (30): ${metadata.keywords.join(', ')}`,
      '',
      `VIDEO TAGS: ${metadata.tags.join(', ')}`,
      '',
      `THUMBNAIL PROMPT: ${metadata.thumbnailPrompt}`,
      '',
      `PUBLISHING NOTES: ${metadata.publishingNotes}`,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPrompt = async () => {
    if (!metadata) return;
    await navigator.clipboard.writeText(metadata.thumbnailPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleGenerateVoicePreview = async () => {
    if (!previewText.trim()) return;
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: previewText.trim(),
          voiceOption: previewSpeaker,
          language: previewLang,
          isPreview: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Voice preview failed');
      setPreviewAudioUrl(data.audioDataUrl);
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : 'Failed to generate voice preview.'
      );
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleUploadToYouTube = async () => {
    if (!metadata) return;
    setUploading(true);
    setUploadError(null);

    const payload: PublishPayload = {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      hashtags: metadata.hashtags,
      category: metadata.category,
      thumbnailPrompt: metadata.thumbnailPrompt,
      scheduledDate,
      scheduledTime,
      timezone,
      videoUrl: videoUrl || '',
    };

    try {
      const res = await fetch('/api/youtube/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Publish request failed');
      setPublishResult(result as PublishResult);
      onPublished(result as PublishResult);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Failed to upload package.'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div>
            <h2
              id="approval-modal-title"
              className="text-lg font-bold text-slate-900 dark:text-white"
            >
              {copy.approvalTitle}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {story.title} · {story.language}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {metadata && (
              <button
                type="button"
                onClick={handleCopyMetadata}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copied ? copy.copied : copy.copyMetadata}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {/* Success Notification */}
          {publishResult && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                <div className="text-sm">
                  <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                    YouTube Publishing Package Prepared & Scheduled
                  </div>
                  <p className="mt-1 text-emerald-800 dark:text-emerald-300">
                    Scheduled for{' '}
                    <span className="font-mono tabular-nums font-semibold">
                      {publishResult.payload.scheduledDate}{' '}
                      {publishResult.payload.scheduledTime}
                    </span>{' '}
                    ({publishResult.payload.timezone}) · Package ID:{' '}
                    <span className="font-mono">{publishResult.publishId}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* YouTube Metadata Section */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              YouTube SEO Metadata
            </h3>

            {loadingMeta && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-violet-700 dark:text-violet-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Generating YouTube SEO title, description, 30 keywords, 15 hashtags, and thumbnail prompt...</span>
                </div>
                <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                <div className="h-28 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              </div>
            )}

            {metaError && (
              <div className="mt-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-700 dark:text-rose-300">
                {metaError}
              </div>
            )}

            {metadata && !loadingMeta && (
              <div className="mt-4 space-y-5">
                {/* 1. Title */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    1. SEO Optimized YouTube Title
                  </label>
                  <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) =>
                      setMetadata({ ...metadata, title: e.target.value })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-medium text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
                  />
                </div>

                {/* 2. Description */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    2. YouTube Description (Story Summary, Bible Lesson & CTA)
                  </label>
                  <textarea
                    rows={6}
                    value={metadata.description}
                    onChange={(e) =>
                      setMetadata({ ...metadata, description: e.target.value })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 leading-relaxed focus:border-violet-600 focus:outline-none"
                  />
                </div>

                {/* 5, 6, 7. Category / Target Audience / Estimated Duration */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 border-y border-slate-200 dark:border-slate-800 py-4">
                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      5. Category
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      {metadata.category}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      6. Target Audience
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                      {metadata.targetAudience}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      7. Estimated Duration
                    </div>
                    <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                      {metadata.estimatedDuration}
                    </div>
                  </div>
                </div>

                {/* 3. 30 SEO Keywords */}
                <div>
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    3. SEO Keywords ({metadata.keywords.length})
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {metadata.keywords.join(' · ')}
                  </p>
                </div>

                {/* 4. 15 Hashtags */}
                <div>
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    4. Hashtags ({metadata.hashtags.length})
                  </div>
                  <p className="mt-1.5 font-mono text-xs leading-relaxed text-violet-700 dark:text-violet-400">
                    {metadata.hashtags.join('  ')}
                  </p>
                </div>

                {/* 8. Thumbnail Prompt */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      8. AI Thumbnail Image Prompt
                    </label>
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-400 hover:underline"
                    >
                      {copiedPrompt ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span>{copiedPrompt ? copy.copied : 'Copy Prompt'}</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={metadata.thumbnailPrompt}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        thumbnailPrompt: e.target.value,
                      })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-200 leading-relaxed focus:border-violet-600 focus:outline-none"
                  />
                </div>

                {/* 9. Video Tags & 10. Publishing Notes */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      9. Video Tags ({metadata.tags.length})
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {metadata.tags.join(', ')}
                    </p>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      10. Publishing Notes
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {metadata.publishingNotes}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Scheduling Section */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {copy.schedulingTitle}
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{copy.scheduledDate}</span>
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{copy.scheduledTime}</span>
                </label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <Globe className="h-3.5 w-3.5" />
                  <span>{copy.timezone}</span>
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Voice Preview Section */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-violet-700 dark:text-violet-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {copy.voicePreviewTitle}
              </h3>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {copy.speakerLabel}
                  </label>
                  <select
                    value={previewSpeaker}
                    onChange={(e) =>
                      setPreviewSpeaker(e.target.value as VoiceOption)
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
                  >
                    {VOICE_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {copy.languageLabel}
                  </label>
                  <select
                    value={previewLang}
                    onChange={(e) =>
                      setPreviewLang(e.target.value as StoryLanguage)
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
                  >
                    <option value="English">English</option>
                    <option value="Tamil">Tamil (தமிழ்)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  {copy.previewTextLabel}
                </label>
                <textarea
                  rows={3}
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <button
                  type="button"
                  disabled={loadingPreview || !previewText.trim()}
                  onClick={handleGenerateVoicePreview}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-700 hover:bg-violet-800 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0"
                >
                  {loadingPreview ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  <span>{copy.generatePreviewBtn}</span>
                </button>

                {previewAudioUrl && (
                  <audio
                    controls
                    src={previewAudioUrl}
                    className="h-10 flex-1 min-w-[220px]"
                  />
                )}
              </div>

              {previewError && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {previewError}
                </p>
              )}
            </div>
          </div>

          {uploadError && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-700 dark:text-rose-300">
              {uploadError}
            </div>
          )}
        </div>

        {/* Upload Footer Section */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-6 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Payload includes Title, Description, Tags, 15 Hashtags, Category, Thumbnail Prompt, Schedule & Video URL.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              disabled={uploading || loadingMeta || !metadata}
              onClick={handleUploadToYouTube}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-700 hover:bg-violet-800 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-white transition-colors whitespace-nowrap"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : publishResult ? (
                <Send className="h-4 w-4" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>{uploading ? copy.uploading : copy.uploadYoutube}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
