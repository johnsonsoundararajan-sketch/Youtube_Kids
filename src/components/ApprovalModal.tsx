import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Mic,
  Send,
  ShieldCheck,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import {
  TARGET_CHANNEL_HANDLE,
  TARGET_CHANNEL_URL,
} from '../lib/youtubeAuth';
import type {
  GeneratedStory,
  PublishPayload,
  PublishResult,
  StoryLanguage,
  VoiceOption,
  YouTubeChannelInfo,
  YouTubeMetadata,
  YouTubePrivacyMode,
} from '../types/story';
import type { UI_COPY } from '../lib/i18n';

interface ApprovalModalProps {
  isOpen: boolean;
  story: GeneratedStory;
  durationSeconds: number;
  videoUrl: string | null;
  initialMetadata?: YouTubeMetadata;
  accessToken: string | null;
  connectedChannel: YouTubeChannelInfo | null;
  isSigningIn: boolean;
  authError: string | null;
  onGoogleSignIn: () => void;
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
  accessToken,
  connectedChannel,
  isSigningIn,
  authError,
  onGoogleSignIn,
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

  // Scheduling & privacy state
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
  const [privacyMode, setPrivacyMode] = useState<YouTubePrivacyMode>('scheduled');

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

  // Upload & Confirmation state
  const [confirmingUpload, setConfirmingUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<string>('');
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPreviewSpeaker(story.voiceOption);
    setPreviewLang(story.language);
    setPreviewText(
      story.scenes[0]?.narrationSegment || story.narrationScript.slice(0, 220)
    );
    setConfirmingUpload(false);
    setPublishResult(null);
    setUploadError(null);
    setUploadStage('');

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

  const handleRequestUpload = () => {
    setUploadError(null);
    if (!metadata) return;
    if (!videoUrl) {
      setUploadError(
        'No rendered video file found in memory. Please close this popup and click Regenerate Video first.'
      );
      return;
    }
    if (!accessToken) {
      setUploadError(
        `Please sign in with Google above and select your ${TARGET_CHANNEL_HANDLE} YouTube channel before uploading.`
      );
      return;
    }
    setConfirmingUpload(true);
  };

  const handleConfirmUploadToYouTube = async () => {
    if (!metadata || !videoUrl || !accessToken) return;
    setConfirmingUpload(false);
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
      privacyMode,
      videoUrl,
    };

    try {
      setUploadStage('Reading animated video file...');
      const videoBlob = await fetch(videoUrl).then((r) => r.blob());
      if (!videoBlob || videoBlob.size === 0) {
        throw new Error('Rendered video file is empty.');
      }

      setUploadStage('Initializing YouTube Data API v3 upload...');
      const initRes = await fetch('/api/youtube/upload/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: metadata.title,
          description: metadata.description,
          tags: [...metadata.tags, ...metadata.keywords],
          hashtags: metadata.hashtags,
          category: metadata.category,
          language: story.language,
          scheduledDate,
          scheduledTime,
          timezone,
          privacyMode,
          contentLength: videoBlob.size,
          mimeType: videoBlob.type || 'video/mp4',
        }),
      });
      const initJson = await initRes.json();
      if (!initRes.ok) {
        throw new Error(initJson.error || 'Failed to initialize YouTube upload.');
      }

      setUploadStage(
        `Uploading ${(videoBlob.size / (1024 * 1024)).toFixed(1)} MB video to ${initJson.channelHandle || initJson.channelTitle}...`
      );
      const binRes = await fetch('/api/youtube/upload/binary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          Authorization: `Bearer ${accessToken}`,
          'x-upload-session-id': initJson.uploadSessionId,
        },
        body: videoBlob,
      });
      const uploadedJson = await binRes.json();
      if (!binRes.ok) {
        throw new Error(uploadedJson.error || 'YouTube binary upload failed.');
      }

      const finalResult: PublishResult = {
        publishId: uploadedJson.publishId,
        videoId: uploadedJson.videoId,
        youtubeUrl: uploadedJson.youtubeUrl,
        studioUrl: uploadedJson.studioUrl,
        channelTitle: uploadedJson.channelTitle,
        channelHandle: uploadedJson.channelHandle,
        publishedAt: uploadedJson.publishedAt,
        scheduledIso: uploadedJson.scheduledIso,
        status: uploadedJson.status,
        payload,
      };
      setPublishResult(finalResult);
      onPublished(finalResult);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Failed to upload video to YouTube.'
      );
    } finally {
      setUploading(false);
      setUploadStage('');
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
          {/* Connected YouTube Channel Account */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Target Channel:{' '}
                  <a
                    href={TARGET_CHANNEL_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-violet-700 dark:text-violet-400 hover:underline"
                  >
                    {TARGET_CHANNEL_HANDLE}
                  </a>
                </div>
                {connectedChannel ? (
                  <div className="mt-1.5 flex items-center gap-2.5">
                    {connectedChannel.thumbnailUrl && (
                      <img
                        src={connectedChannel.thumbnailUrl}
                        alt={connectedChannel.title}
                        referrerPolicy="no-referrer"
                        className="h-7 w-7 rounded-full border border-slate-200 dark:border-slate-700 object-cover"
                      />
                    )}
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {connectedChannel.title}{' '}
                      <span className="font-mono text-xs font-normal text-slate-500 dark:text-slate-400">
                        ({connectedChannel.customUrl})
                      </span>
                    </div>
                    {connectedChannel.matchesTargetChannel && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Verified Channel
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                    Connect your Google account managing {TARGET_CHANNEL_HANDLE} to upload directly via YouTube Data API v3.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <GoogleSignInButton
                  onClick={onGoogleSignIn}
                  loading={isSigningIn}
                  label={
                    accessToken ? 'Switch YouTube Account' : 'Sign in with Google'
                  }
                />
              </div>
            </div>

            {connectedChannel && !connectedChannel.matchesTargetChannel && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Connected channel is <strong>{connectedChannel.title}</strong> ({connectedChannel.customUrl}), which differs from <strong>{TARGET_CHANNEL_HANDLE}</strong>. Click Switch YouTube Account above to select your @A-VerseForYou Brand Account, or proceed if intentional.
                </span>
              </div>
            )}

            {authError && (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                {authError}
              </p>
            )}
          </div>

          {/* Success Notification */}
          {publishResult && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                <div className="text-sm space-y-1.5">
                  <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                    Video Uploaded to {publishResult.channelTitle || TARGET_CHANNEL_HANDLE}{' '}
                    {publishResult.channelHandle ? `(${publishResult.channelHandle})` : ''}
                  </div>
                  <p className="text-emerald-800 dark:text-emerald-300">
                    Status: <span className="font-semibold">{publishResult.status}</span> · Video ID:{' '}
                    <span className="font-mono">{publishResult.videoId || publishResult.publishId}</span>
                  </p>
                  {publishResult.youtubeUrl && (
                    <div className="flex flex-wrap items-center gap-4 pt-1">
                      <a
                        href={publishResult.youtubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-200 underline hover:opacity-80"
                      >
                        <span>Watch on YouTube</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      {publishResult.studioUrl && (
                        <a
                          href={publishResult.studioUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-200 underline hover:opacity-80"
                        >
                          <span>Open in YouTube Studio</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}
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
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Visibility
                </label>
                <select
                  value={privacyMode}
                  onChange={(e) =>
                    setPrivacyMode(e.target.value as YouTubePrivacyMode)
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
                >
                  <option value="scheduled">Scheduled (Publish At)</option>
                  <option value="public">Public (Immediate)</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private Draft</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{copy.scheduledDate}</span>
                </label>
                <input
                  type="date"
                  disabled={privacyMode !== 'scheduled'}
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50 px-3 py-2 text-sm tabular-nums text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{copy.scheduledTime}</span>
                </label>
                <input
                  type="time"
                  disabled={privacyMode !== 'scheduled'}
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50 px-3 py-2 text-sm tabular-nums text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <Globe className="h-3.5 w-3.5" />
                  <span>{copy.timezone}</span>
                </label>
                <select
                  disabled={privacyMode !== 'scheduled'}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
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

        {/* Explicit Upload Confirmation Dialog Banner (Mandatory before mutating YouTube account) */}
        {confirmingUpload && metadata && (
          <div className="border-t border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm text-amber-950 dark:text-amber-100">
                <div className="font-bold">
                  Confirm upload to YouTube channel{' '}
                  {connectedChannel?.title || TARGET_CHANNEL_HANDLE}?
                </div>
                <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                  Title: &ldquo;{metadata.title}&rdquo; · Visibility:{' '}
                  {privacyMode === 'scheduled'
                    ? `Scheduled (${scheduledDate} ${scheduledTime} ${timezone})`
                    : privacyMode}{' '}
                  · Audience: Made for Kids (COPPA)
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmingUpload(false)}
                  className="rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUploadToYouTube}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-semibold text-white"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Confirm & Upload to YouTube</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Footer Section */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-6 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {uploading && uploadStage
              ? uploadStage
              : `Uploads video binary + SEO metadata directly to ${connectedChannel?.customUrl || TARGET_CHANNEL_HANDLE} via YouTube Data API v3.`}
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
              onClick={handleRequestUpload}
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
