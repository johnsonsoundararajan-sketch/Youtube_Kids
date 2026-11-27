import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Moon, Sun, Languages, LogOut, ShieldCheck } from 'lucide-react';
import { HeaderBar } from './components/HeaderBar';
import { VideoStage } from './components/VideoStage';
import { ApprovalModal } from './components/ApprovalModal';
import { ScriptAndHistory } from './components/ScriptAndHistory';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import {
  fetchConnectedYouTubeChannel,
  googleSignIn,
  initAuth,
  logout,
  TARGET_CHANNEL_HANDLE,
  TARGET_CHANNEL_URL,
} from './lib/youtubeAuth';
import { UI_COPY } from './lib/i18n';
import {
  cacheProjectMedia,
  deleteCachedProjectMedia,
  loadCachedProjectMedia,
  loadProjectHistory,
  loadSettings,
  saveProjectHistory,
  saveSettings,
} from './lib/storage';
import {
  computeAmplitudeTimeline,
  createSilentNarrationTrack,
  decodeAudioDataUrl,
  generateBalancedSoundtrack,
} from './lib/musicEngine';
import { renderAnimatedVideo } from './lib/animationRenderer';
import {
  generateSceneIllustrations,
  renderSlideshowVideo,
} from './lib/imageStoryRenderer';
import type {
  GeneratedStory,
  PublishResult,
  SceneAudioTiming,
  StoryLanguage,
  StoryProjectRecord,
  StoryVideoMode,
  UILocale,
  VideoStatus,
  VoiceOption,
  YouTubeChannelInfo,
  YouTubeMetadata,
} from './types/story';

const VOICE_OPTIONS: VoiceOption[] = [
  'Cute Narrator',
  'Girl Character',
  'Boy Character',
  'Animal Character',
];

export default function App() {
  const initialSettings = loadSettings();
  const [darkMode, setDarkMode] = useState<boolean>(initialSettings.darkMode);
  const [uiLocale, setUiLocale] = useState<UILocale>(initialSettings.uiLocale);
  const [storyLanguage, setStoryLanguage] = useState<StoryLanguage>('English');
  const [voiceOption, setVoiceOption] = useState<VoiceOption>('Cute Narrator');
  const [themeTopic, setThemeTopic] = useState<string>('');
  const [activeSection, setActiveSection] = useState<
    'studio' | 'script' | 'history'
  >('studio');

  const [story, setStory] = useState<GeneratedStory | null>(null);
  const [activeGenerationMode, setActiveGenerationMode] =
    useState<StoryVideoMode | null>(null);
  const [status, setStatus] = useState<VideoStatus>('Idle');
  const [stageLabel, setStageLabel] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMimeType, setVideoMimeType] = useState<string>('video/mp4');
  const [narrationUrl, setNarrationUrl] = useState<string | null>(null);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);

  const [history, setHistory] = useState<StoryProjectRecord[]>(() =>
    loadProjectHistory()
  );
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isApprovalOpen, setIsApprovalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // YouTube OAuth state (token kept strictly in memory)
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [connectedChannel, setConnectedChannel] =
    useState<YouTubeChannelInfo | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const narrationDataUrlRef = useRef<string | null>(null);
  const sceneTimingsRef = useRef<SceneAudioTiming[] | null>(null);
  const urlsRef = useRef<{
    video: string | null;
    narration: string | null;
    music: string | null;
  }>({ video: null, narration: null, music: null });

  const copy = UI_COPY[uiLocale];

  useEffect(() => {
    const unsubscribe = initAuth(
      async (_user, token) => {
        setAccessToken(token);
        try {
          const ch = await fetchConnectedYouTubeChannel(token);
          setConnectedChannel(ch);
        } catch {
          // Handled on explicit upload or sign-in
        }
      },
      () => {
        setAccessToken(null);
        setConnectedChannel(null);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    saveSettings({ darkMode, uiLocale });
  }, [darkMode, uiLocale]);

  useEffect(() => {
    return () => {
      if (urlsRef.current.video) URL.revokeObjectURL(urlsRef.current.video);
      if (urlsRef.current.narration) URL.revokeObjectURL(urlsRef.current.narration);
      if (urlsRef.current.music) URL.revokeObjectURL(urlsRef.current.music);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  }, []);

  const setMediaObjectUrls = useCallback(
    (blobs: {
      videoBlob?: Blob;
      narrationBlob?: Blob;
      musicBlob?: Blob;
      mimeType?: string;
    }) => {
      if (urlsRef.current.video) URL.revokeObjectURL(urlsRef.current.video);
      if (urlsRef.current.narration) URL.revokeObjectURL(urlsRef.current.narration);
      if (urlsRef.current.music) URL.revokeObjectURL(urlsRef.current.music);

      const nextVideo = blobs.videoBlob
        ? URL.createObjectURL(blobs.videoBlob)
        : null;
      const nextNarration = blobs.narrationBlob
        ? URL.createObjectURL(blobs.narrationBlob)
        : null;
      const nextMusic = blobs.musicBlob
        ? URL.createObjectURL(blobs.musicBlob)
        : null;

      urlsRef.current = {
        video: nextVideo,
        narration: nextNarration,
        music: nextMusic,
      };
      setVideoUrl(nextVideo);
      setNarrationUrl(nextNarration);
      setMusicUrl(nextMusic);
      if (blobs.mimeType) setVideoMimeType(blobs.mimeType);
    },
    []
  );

  const compileAudioAndVideoFromStory = useCallback(
    async (
      targetStory: GeneratedStory,
      existingNarrationDataUrl?: string | null,
      musicOnlyFallback = false
    ) => {
      const isImageStory = targetStory.videoMode === 'image_slideshow';
      setErrorMessage(null);
      setStatus('Generating');

      let narrationBuffer: AudioBuffer;
      let narrationBlob: Blob;
      let measuredTimings: SceneAudioTiming[] | null = existingNarrationDataUrl
        ? sceneTimingsRef.current
        : null;

      if (musicOnlyFallback) {
        setStageLabel('Preparing music-only soundtrack for story scenes...');
        setProgress(30);
        let cursor = 0;
        measuredTimings = targetStory.scenes.map((scene) => {
          const dur = Math.max(4, scene.duration || 12);
          const start = cursor;
          const end = cursor + dur;
          cursor = end;
          return {
            sceneNumber: scene.sceneNumber,
            duration: dur,
            audioStartSec: Math.round(start * 1000) / 1000,
            audioEndSec: Math.round(end * 1000) / 1000,
          };
        });
        const silent = createSilentNarrationTrack(Math.max(18, cursor));
        narrationBuffer = silent.buffer;
        narrationBlob = silent.blob;
      } else {
        setStageLabel(
          `Recording ${targetStory.voiceOption} narration in ${targetStory.language}...`
        );
        setProgress(24);

        let narDataUrl = existingNarrationDataUrl || null;

        if (!narDataUrl) {
          const ttsRes = await fetch('/api/voice/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: targetStory.narrationScript,
              scenes: targetStory.scenes,
              voiceOption: targetStory.voiceOption,
              language: targetStory.language,
              isPreview: false,
            }),
          });
          const ttsJson = await ttsRes.json();
          if (!ttsRes.ok) {
            throw new Error(ttsJson.error || 'Voice synthesis failed.');
          }
          narDataUrl = ttsJson.audioDataUrl as string;
          if (Array.isArray(ttsJson.sceneTimings) && ttsJson.sceneTimings.length > 0) {
            measuredTimings = ttsJson.sceneTimings as SceneAudioTiming[];
          }
        }
        narrationDataUrlRef.current = narDataUrl;
        sceneTimingsRef.current = measuredTimings;

        setStatus('Processing');
        setStageLabel('Composing soft magical music & syncing scene timings...');
        setProgress(48);

        const decoded = await decodeAudioDataUrl(narDataUrl);
        narrationBuffer = decoded.buffer;
        narrationBlob = decoded.blob;
      }

      setStatus('Processing');
      setStageLabel('Composing soft magical music & syncing scene timings...');
      setProgress(48);

      const { mixedBuffer, musicOnlyBlob, totalDurationSec, introOffsetSec } =
        await generateBalancedSoundtrack(narrationBuffer, targetStory.musicProfile);

      // Lock every scene's exact duration, startTimeSec, and endTimeSec to the measured audio
      const syncedScenes = targetStory.scenes.map((scene, idx) => {
        const timing =
          measuredTimings?.find((t) => t.sceneNumber === scene.sceneNumber) ??
          measuredTimings?.[idx];
        const narrationText = scene.narration || scene.narrationSegment;
        const promptText = scene.imagePrompt || scene.visualDescription || narrationText;

        if (timing) {
          const isFirst = idx === 0;
          const isLast = idx === targetStory.scenes.length - 1;
          const start = isFirst ? 0 : introOffsetSec + timing.audioStartSec;
          const end = isLast
            ? totalDurationSec
            : introOffsetSec + timing.audioEndSec;
          const dur = Math.max(0.5, Math.round((end - start) * 100) / 100);
          return {
            ...scene,
            narration: narrationText,
            narrationSegment: narrationText,
            imagePrompt: promptText,
            visualDescription: promptText,
            duration: dur,
            startTimeSec: Math.round(start * 1000) / 1000,
            endTimeSec: Math.round(end * 1000) / 1000,
          };
        }

        return {
          ...scene,
          narration: narrationText,
          narrationSegment: narrationText,
          imagePrompt: promptText,
          visualDescription: promptText,
        };
      });

      const syncedStory: GeneratedStory = {
        ...targetStory,
        scenes: syncedScenes,
        estimatedDurationSec: Math.round(totalDurationSec),
      };
      setStory(syncedStory);
      setDurationSeconds(totalDurationSec);

      if (isImageStory) {
        setStageLabel('Illustrating each scene directly from its narration...');
        setProgress(58);
        await generateSceneIllustrations(syncedStory, (scenePct) => {
          setProgress(58 + Math.round(scenePct * 0.12));
        });
      }

      setStageLabel(
        isImageStory
          ? 'Converting synced scene illustrations into slideshow MP4 video...'
          : 'Rendering animated characters, camera moves & MP4 video...'
      );
      setProgress(70);

      const speechTimeline = computeAmplitudeTimeline(
        narrationBuffer,
        24,
        introOffsetSec,
        totalDurationSec
      );

      const { blob: videoBlob, mimeType } = isImageStory
        ? await renderSlideshowVideo(
            syncedStory,
            mixedBuffer,
            speechTimeline,
            totalDurationSec,
            (renderPct) => {
              setProgress(70 + Math.round(renderPct * 0.3));
            }
          )
        : await renderAnimatedVideo(
            syncedStory,
            mixedBuffer,
            speechTimeline,
            totalDurationSec,
            (renderPct) => {
              setProgress(70 + Math.round(renderPct * 0.3));
            }
          );

      setMediaObjectUrls({
        videoBlob,
        narrationBlob,
        musicBlob: musicOnlyBlob,
        mimeType,
      });

      await cacheProjectMedia(syncedStory.id, {
        videoBlob,
        narrationBlob,
        musicBlob: musicOnlyBlob,
      });

      const record: StoryProjectRecord = {
        id: syncedStory.id,
        story: syncedStory,
        durationSeconds: totalDurationSec,
        status: 'Completed',
        videoMimeType: mimeType,
      };

      setHistory((prev) => {
        const filtered = prev.filter((p) => p.id !== record.id);
        const next = [record, ...filtered];
        saveProjectHistory(next);
        return next;
      });
      setActiveProjectId(syncedStory.id);
      setStatus('Completed');
      setProgress(100);
      setStageLabel('Completed');
    },
    [setMediaObjectUrls]
  );

  const handleGenerateStory = useCallback(
    async (mode: StoryVideoMode = 'animated') => {
      setErrorMessage(null);
      setActiveGenerationMode(mode);
      setStatus('Generating');
      setStageLabel(
        mode === 'image_slideshow'
          ? `Writing ${storyLanguage} story scenes with matched narration & image prompts...`
          : `Writing an original ${storyLanguage} Bible kids story...`
      );
      setProgress(10);
      setVideoUrl(null);
      narrationDataUrlRef.current = null;
      sceneTimingsRef.current = null;

      try {
        const storyRes = await fetch('/api/story/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: storyLanguage,
            voiceOption,
            theme: themeTopic.trim(),
            previousTitle: story?.title || '',
            mode,
          }),
        });
        const storyJson = await storyRes.json();
        if (!storyRes.ok) {
          throw new Error(storyJson.error || 'Story generation failed.');
        }

        const rawStory = storyJson as GeneratedStory;
        const resolvedMode = rawStory.videoMode || mode;
        const generatedStory: GeneratedStory = {
          ...rawStory,
          videoMode: resolvedMode,
          scenes: rawStory.scenes.map((scene) => {
            const narrationText = scene.narration || scene.narrationSegment || '';
            const promptText = scene.imagePrompt || scene.visualDescription || narrationText;
            return {
              ...scene,
              narration: narrationText,
              narrationSegment: narrationText,
              imagePrompt: promptText,
              visualDescription: promptText,
              characters:
                resolvedMode === 'image_slideshow'
                  ? (scene.characters || []).map((c) => ({ ...c, endX: c.startX }))
                  : scene.characters || [],
            };
          }),
        };
        setStory(generatedStory);
        setActiveProjectId(generatedStory.id);
        await compileAudioAndVideoFromStory(generatedStory, null);
      } catch (err) {
        console.error('Pipeline failed:', err);
        setStatus('Failed');
        setErrorMessage(
          err instanceof Error ? err.message : 'An unexpected error occurred.'
        );
      } finally {
        setActiveGenerationMode(null);
      }
    },
    [
      storyLanguage,
      voiceOption,
      themeTopic,
      story?.title,
      compileAudioAndVideoFromStory,
    ]
  );

  const handleRegenerateVideo = useCallback(async () => {
    if (!story) return;
    const mode = story.videoMode || 'animated';
    setActiveGenerationMode(mode);
    try {
      const updatedStory: GeneratedStory = {
        ...story,
        voiceOption,
        language: storyLanguage,
        videoMode: mode,
      };
      setStory(updatedStory);
      const reuseExistingAudio =
        voiceOption === story.voiceOption && storyLanguage === story.language;
      await compileAudioAndVideoFromStory(
        updatedStory,
        reuseExistingAudio ? narrationDataUrlRef.current : null
      );
    } catch (err) {
      setStatus('Failed');
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to regenerate video.'
      );
    } finally {
      setActiveGenerationMode(null);
    }
  }, [story, voiceOption, storyLanguage, compileAudioAndVideoFromStory]);

  const handleContinueMusicOnly = useCallback(async () => {
    if (!story) return;
    const mode = story.videoMode || 'animated';
    setActiveGenerationMode(mode);
    try {
      await compileAudioAndVideoFromStory(story, null, true);
    } catch (err) {
      setStatus('Failed');
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to render music-only video.'
      );
    } finally {
      setActiveGenerationMode(null);
    }
  }, [story, compileAudioAndVideoFromStory]);

  const handleDownloadScript = () => {
    if (!story) return;
    const content = [
      story.title,
      `Bible Reference: ${story.bibleReference}`,
      `Moral Lesson: ${story.moralLesson}`,
      `Language: ${story.language}`,
      '',
      '--- NARRATION SCRIPT ---',
      '',
      ...story.scenes.map(
        (s) =>
          `Scene ${s.sceneNumber}: ${s.title} (${s.environment}, ${s.cameraMove})\n${s.narrationSegment}\n`
      ),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${story.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'story'}-script.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = async (record: StoryProjectRecord) => {
    setStory(record.story);
    setActiveProjectId(record.id);
    setStoryLanguage(record.story.language);
    setVoiceOption(record.story.voiceOption);
    setDurationSeconds(record.durationSeconds);
    setErrorMessage(null);
    narrationDataUrlRef.current = null;

    const cached = await loadCachedProjectMedia(record.id);
    if (cached?.videoBlob) {
      setMediaObjectUrls({
        videoBlob: cached.videoBlob,
        narrationBlob: cached.narrationBlob,
        musicBlob: cached.musicBlob,
        mimeType: record.videoMimeType || 'video/mp4',
      });
      setStatus('Completed');
      setProgress(100);
    } else {
      setMediaObjectUrls({});
      setStatus('Idle');
      showToast('Story loaded. Click Regenerate Video to re-render the MP4 file.');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteCachedProjectMedia(projectId);
    setHistory((prev) => {
      const next = prev.filter((p) => p.id !== projectId);
      saveProjectHistory(next);
      return next;
    });
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
  };

  const handleMetadataReady = (meta: YouTubeMetadata) => {
    if (!story) return;
    setHistory((prev) => {
      const next = prev.map((item) =>
        item.id === story.id ? { ...item, youtubeMetadata: meta } : item
      );
      saveProjectHistory(next);
      return next;
    });
  };

  const handlePublished = (result: PublishResult) => {
    if (!story) return;
    setHistory((prev) => {
      const next = prev.map((item) =>
        item.id === story.id ? { ...item, publishResult: result } : item
      );
      saveProjectHistory(next);
      return next;
    });
    showToast(
      result.videoId
        ? `Uploaded to ${result.channelHandle || TARGET_CHANNEL_HANDLE} (Video ID: ${result.videoId}).`
        : `YouTube upload package scheduled for ${result.payload.scheduledDate} at ${result.payload.scheduledTime}.`
    );
  };

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setAccessToken(res.accessToken);
        const ch = await fetchConnectedYouTubeChannel(res.accessToken);
        setConnectedChannel(ch);
        if (ch) {
          showToast(`Connected YouTube channel: ${ch.title} (${ch.customUrl})`);
        }
      }
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Google sign-in failed.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setAccessToken(null);
    setConnectedChannel(null);
  };

  const handleNavigate = (section: 'studio' | 'script' | 'history') => {
    setActiveSection(section);
    const el = document.getElementById(section);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const activeRecord = history.find((h) => h.id === story?.id);
  const isBusy = status === 'Generating' || status === 'Processing';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* HEADER SECTION */}
      <HeaderBar
        title={copy.appTitle}
        navStudio={copy.navStudio}
        navScript={copy.navScript}
        navHistory={copy.navHistory}
        generateLabel={copy.generateBtn}
        generatingLabel={copy.generatingBtn}
        generateImageStoryLabel={copy.generateImageStoryBtn}
        generatingImageStoryLabel={copy.generatingImageStoryBtn}
        isBusy={isBusy}
        activeGenerationMode={activeGenerationMode}
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onGenerate={() => handleGenerateStory('animated')}
        onGenerateImageStory={() => handleGenerateStory('image_slideshow')}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-medium text-slate-900 dark:text-white shadow-lg"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        {/* Workspace Controls Bar */}
        <section
          aria-label="Story and studio configuration"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 md:p-5"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Language Selector */}
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {copy.storyLanguage}
                </div>
                <div className="mt-1.5 inline-flex w-full rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                  {(['English', 'Tamil'] as StoryLanguage[]).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      disabled={isBusy}
                      onClick={() => setStoryLanguage(lang)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                        storyLanguage === lang
                          ? 'bg-white dark:bg-slate-950 text-violet-700 dark:text-violet-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {lang === 'Tamil' ? 'Tamil (தமிழ்)' : 'English'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Option */}
              <div>
                <label
                  htmlFor="voice-option-select"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  {copy.voiceStyle}
                </label>
                <select
                  id="voice-option-select"
                  disabled={isBusy}
                  value={voiceOption}
                  onChange={(e) => setVoiceOption(e.target.value as VoiceOption)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-medium text-slate-900 dark:text-white focus:border-violet-600 focus:outline-none"
                >
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {/* Story Topic */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="story-topic-input"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  {copy.themeLabel}
                </label>
                <input
                  id="story-topic-input"
                  type="text"
                  disabled={isBusy}
                  value={themeTopic}
                  onChange={(e) => setThemeTopic(e.target.value)}
                  placeholder={copy.themePlaceholder}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-violet-600 focus:outline-none"
                />
              </div>
            </div>

            {/* UI Locale & Dark Mode */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setUiLocale((prev) => (prev === 'en' ? 'ta' : 'en'))
                }
                aria-label="Toggle UI language"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Languages className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <span>{uiLocale === 'en' ? 'EN / தமிழ்' : 'தமிழ் / EN'}</span>
              </button>

              <button
                type="button"
                onClick={() => setDarkMode((prev) => !prev)}
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {darkMode ? (
                  <Sun className="h-4 w-4 text-amber-400" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* YouTube Channel Connection Strip */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-3.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>YouTube Upload Target:</span>
              <a
                href={TARGET_CHANNEL_URL}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-violet-700 dark:text-violet-400 hover:underline"
              >
                {TARGET_CHANNEL_HANDLE}
              </a>
              {connectedChannel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                    {connectedChannel.matchesTargetChannel && (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    )}
                    Connected: {connectedChannel.title} ({connectedChannel.customUrl})
                  </span>
                </>
              )}
              {authError && (
                <span className="text-rose-600 dark:text-rose-400">
                  · {authError}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {accessToken ? (
                <>
                  <GoogleSignInButton
                    onClick={handleGoogleSignIn}
                    loading={isSigningIn}
                    label="Switch Channel"
                  />
                  <button
                    type="button"
                    onClick={handleGoogleLogout}
                    aria-label="Sign out of Google"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out</span>
                  </button>
                </>
              ) : (
                <GoogleSignInButton
                  onClick={handleGoogleSignIn}
                  loading={isSigningIn}
                  label="Sign in with Google"
                />
              )}
            </div>
          </div>
        </section>

        {/* CENTER SECTION: Video Player & Metadata */}
        <VideoStage
          story={story}
          videoUrl={videoUrl}
          videoMimeType={videoMimeType}
          narrationUrl={narrationUrl}
          musicUrl={musicUrl}
          status={status}
          stageLabel={stageLabel}
          progress={progress}
          durationSeconds={durationSeconds}
          errorMessage={errorMessage}
          copy={copy}
          onRegenerateStory={() => handleGenerateStory(story?.videoMode || 'animated')}
          onRegenerateVideo={handleRegenerateVideo}
          onContinueMusicOnly={handleContinueMusicOnly}
          onDownloadScript={handleDownloadScript}
        />

        {/* BOTTOM SECTION: Large Green APPROVE Button */}
        <section className="flex flex-col items-center justify-center py-2">
          <button
            type="button"
            disabled={!story || status !== 'Completed'}
            onClick={() => setIsApprovalOpen(true)}
            className="w-full sm:w-auto min-w-[280px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/40 disabled:cursor-not-allowed px-10 py-4 text-base font-bold tracking-wide text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
          >
            {copy.approveBtn}
          </button>
        </section>

        {/* Script Breakdown & Story History */}
        <ScriptAndHistory
          story={story}
          history={history}
          activeProjectId={activeProjectId}
          copy={copy}
          onLoadProject={handleLoadProject}
          onDeleteProject={handleDeleteProject}
        />
      </main>

      {/* APPROVAL POPUP MODAL */}
      {story && (
        <ApprovalModal
          isOpen={isApprovalOpen}
          story={story}
          durationSeconds={durationSeconds}
          videoUrl={videoUrl}
          initialMetadata={activeRecord?.youtubeMetadata}
          accessToken={accessToken}
          connectedChannel={connectedChannel}
          isSigningIn={isSigningIn}
          authError={authError}
          onGoogleSignIn={handleGoogleSignIn}
          copy={copy}
          onClose={() => setIsApprovalOpen(false)}
          onMetadataReady={handleMetadataReady}
          onPublished={handlePublished}
        />
      )}
    </div>
  );
}
