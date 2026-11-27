import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Film, FolderOpen, Trash2 } from 'lucide-react';
import type { GeneratedStory, StoryProjectRecord } from '../types/story';
import { generateSceneIllustrations } from '../lib/imageStoryRenderer';
import type { UI_COPY } from '../lib/i18n';

interface ScriptAndHistoryProps {
  story: GeneratedStory | null;
  history: StoryProjectRecord[];
  activeProjectId: string | null;
  copy: (typeof UI_COPY)['en'];
  onLoadProject: (record: StoryProjectRecord) => void;
  onDeleteProject: (projectId: string) => void;
}

const HARBOR_ART_URL = '/src/assets/images/storybook_ark_harbor_1795731495814.jpg';

export function ScriptAndHistory({
  story,
  history,
  activeProjectId,
  copy,
  onLoadProject,
  onDeleteProject,
}: ScriptAndHistoryProps) {
  const [tab, setTab] = useState<'script' | 'scenes'>('script');
  const [imgError, setImgError] = useState(false);
  const [sceneThumbs, setSceneThumbs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!story || story.videoMode !== 'image_slideshow') {
      setSceneThumbs([]);
      return;
    }
    void generateSceneIllustrations(story).then((plates) => {
      if (cancelled) return;
      const thumbs = plates.map((plate) => {
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 320;
        thumbCanvas.height = 180;
        const tctx = thumbCanvas.getContext('2d');
        if (tctx) {
          tctx.drawImage(plate, 0, 0, 320, 180);
        }
        return thumbCanvas.toDataURL('image/jpeg', 0.82);
      });
      setSceneThumbs(thumbs);
    });
    return () => {
      cancelled = true;
    };
  }, [story]);

  const isImageStory = story?.videoMode === 'image_slideshow';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Story Script & Animated/Illustrated Scenes */}
      <section
        id="script"
        className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-violet-700 dark:text-violet-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {copy.navScript}
            </h2>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setTab('script')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === 'script'
                  ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {copy.storyScript}
            </button>
            <button
              type="button"
              onClick={() => setTab('scenes')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === 'scenes'
                  ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {isImageStory ? copy.sceneIllustrationsTab : copy.sceneTimeline}
            </button>
          </div>
        </div>

        {!story ? (
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-5 items-center">
            <div className="sm:col-span-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 aspect-video sm:aspect-4/3 bg-slate-100 dark:bg-slate-800">
              {!imgError ? (
                <img
                  src={HARBOR_ART_URL}
                  alt="Lamb and songbirds along a sunlit flower path"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-950 dark:to-slate-900">
                  <Film className="h-8 w-8 text-violet-500" />
                </div>
              )}
            </div>
            <div className="sm:col-span-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Original Bible Storytelling Script
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Every generated story includes a positive moral lesson, scripture reference, 2–3 minute child-friendly narration in English or Tamil, and 8 continuous story scenes.
              </p>
            </div>
          </div>
        ) : tab === 'script' ? (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {copy.bibleReference}
                </div>
                <div className="mt-1 text-sm font-semibold text-violet-700 dark:text-violet-400">
                  {story.bibleReference}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {copy.moralLesson}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {story.moralLesson}
                </div>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto pr-2 space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {story.scenes.map((scene) => (
                <p key={scene.sceneNumber}>{scene.narration || scene.narrationSegment}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5 max-h-80 overflow-y-auto pr-1 divide-y divide-slate-200 dark:divide-slate-800">
            {story.scenes.map((scene, idx) => {
              const thumb = sceneThumbs[idx];
              const scenePrompt = scene.imagePrompt || scene.visualDescription;
              const sceneNarration = scene.narration || scene.narrationSegment;
              const sceneDur =
                typeof scene.duration === 'number' && scene.duration > 0
                  ? `${scene.duration.toFixed(1)}s`
                  : null;
              return (
                <div
                  key={scene.sceneNumber}
                  className="py-3 first:pt-0 last:pb-0 flex items-start gap-3"
                >
                  {isImageStory && thumb && (
                    <img
                      src={thumb}
                      alt={scene.title}
                      className="h-16 w-28 shrink-0 rounded-md border border-slate-200 dark:border-slate-700 object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        <span className="font-mono text-xs text-violet-700 dark:text-violet-400 mr-2 tabular-nums">
                          {String(scene.sceneNumber).padStart(2, '0')}
                        </span>
                        {scene.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono tabular-nums">
                        {scene.environment} · {sceneDur ?? scene.cameraMove}
                      </div>
                    </div>
                    {scenePrompt && (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {scenePrompt}
                      </p>
                    )}
                    {sceneNarration && (
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                        {sceneNarration}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Story History */}
      <section
        id="history"
        className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {copy.historyTitle}
          </h2>
          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {history.length} saved
          </span>
        </div>

        {history.length === 0 ? (
          <p className="mt-5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {copy.historyEmpty}
          </p>
        ) : (
          <div className="mt-4 max-h-80 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
            {history.map((item) => {
              const isSelected = item.id === activeProjectId;
              return (
                <div
                  key={item.id}
                  className={`py-3.5 first:pt-0 last:pb-0 ${
                    isSelected ? 'bg-violet-50/60 dark:bg-violet-950/20 -mx-2 px-2 rounded-lg' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {item.story.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>{item.story.language}</span>
                        {item.story.videoMode === 'image_slideshow' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-violet-700 dark:text-violet-400 font-medium">
                              {copy.imageStoryModeLabel}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {Math.floor(item.durationSeconds / 60)}:
                          {String(Math.round(item.durationSeconds % 60)).padStart(2, '0')}
                        </span>
                        {item.publishResult && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              Scheduled
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onLoadProject(item)}
                        title={copy.loadProject}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>{copy.loadProject}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteProject(item.id)}
                        title={copy.deleteProject}
                        aria-label={copy.deleteProject}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
