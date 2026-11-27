import { Sparkles, Loader2, Images } from 'lucide-react';
import type { StoryVideoMode } from '../types/story';

interface HeaderBarProps {
  title: string;
  navStudio: string;
  navScript: string;
  navHistory: string;
  generateLabel: string;
  generatingLabel: string;
  generateImageStoryLabel: string;
  generatingImageStoryLabel: string;
  isBusy: boolean;
  activeGenerationMode: StoryVideoMode | null;
  activeSection: 'studio' | 'script' | 'history';
  onNavigate: (section: 'studio' | 'script' | 'history') => void;
  onGenerate: () => void;
  onGenerateImageStory: () => void;
}

export function HeaderBar({
  title,
  navStudio,
  navScript,
  navHistory,
  generateLabel,
  generatingLabel,
  generateImageStoryLabel,
  generatingImageStoryLabel,
  isBusy,
  activeGenerationMode,
  activeSection,
  onNavigate,
  onGenerate,
  onGenerateImageStory,
}: HeaderBarProps) {
  const isAnimatedBusy = isBusy && activeGenerationMode !== 'image_slideshow';
  const isImageBusy = isBusy && activeGenerationMode === 'image_slideshow';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('studio');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          {title}
        </a>

        <nav
          aria-label="Primary"
          className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          <button
            type="button"
            onClick={() => onNavigate('studio')}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 dark:hover:text-white ${
              activeSection === 'studio'
                ? 'text-violet-700 dark:text-violet-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            {navStudio}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('script')}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 dark:hover:text-white ${
              activeSection === 'script'
                ? 'text-violet-700 dark:text-violet-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            {navScript}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 dark:hover:text-white ${
              activeSection === 'history'
                ? 'text-violet-700 dark:text-violet-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            {navHistory}
          </button>
        </nav>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isBusy}
            onClick={onGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 hover:bg-violet-800 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
          >
            {isAnimatedBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{isAnimatedBusy ? generatingLabel : generateLabel}</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={onGenerateImageStory}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/60 hover:bg-violet-100 dark:hover:bg-violet-900/70 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-violet-800 dark:text-violet-200 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
          >
            {isImageBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Images className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{isImageBusy ? generatingImageStoryLabel : generateImageStoryLabel}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
