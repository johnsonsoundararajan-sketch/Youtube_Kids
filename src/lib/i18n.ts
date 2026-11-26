import type { UILocale } from '../types/story';

export const UI_COPY: Record<
  UILocale,
  {
    appTitle: string;
    navStudio: string;
    navScript: string;
    navHistory: string;
    generateBtn: string;
    generatingBtn: string;
    storyLanguage: string;
    voiceStyle: string;
    themeLabel: string;
    themePlaceholder: string;
    statusLabel: string;
    titleLabel: string;
    languageLabel: string;
    durationLabel: string;
    createdLabel: string;
    approveBtn: string;
    play: string;
    pause: string;
    fullscreen: string;
    downloadVideo: string;
    downloadAudio: string;
    downloadMusic: string;
    downloadScript: string;
    regenerateStory: string;
    regenerateVideo: string;
    moralLesson: string;
    bibleReference: string;
    storyScript: string;
    sceneTimeline: string;
    historyTitle: string;
    historyEmpty: string;
    loadProject: string;
    deleteProject: string;
    emptyStageTitle: string;
    emptyStageSubtitle: string;
    approvalTitle: string;
    copyMetadata: string;
    copied: string;
    uploadYoutube: string;
    uploading: string;
    voicePreviewTitle: string;
    speakerLabel: string;
    previewTextLabel: string;
    generatePreviewBtn: string;
    schedulingTitle: string;
    scheduledDate: string;
    scheduledTime: string;
    timezone: string;
  }
> = {
  en: {
    appTitle: 'Bible Kids Video Creator',
    navStudio: 'Studio',
    navScript: 'Script & Scenes',
    navHistory: 'History',
    generateBtn: 'Generate Story & Video',
    generatingBtn: 'Creating Story & Video...',
    storyLanguage: 'Story Language',
    voiceStyle: 'Narration Voice',
    themeLabel: 'Story Topic (Optional)',
    themePlaceholder: 'e.g., Noah and the Rainbow, Kindness, David & Goliath...',
    statusLabel: 'Video Status',
    titleLabel: 'Story Title',
    languageLabel: 'Language',
    durationLabel: 'Duration',
    createdLabel: 'Creation Date',
    approveBtn: 'APPROVE',
    play: 'Play',
    pause: 'Pause',
    fullscreen: 'Full Screen',
    downloadVideo: 'Download Video',
    downloadAudio: 'Download Audio',
    downloadMusic: 'Download Music',
    downloadScript: 'Download Script',
    regenerateStory: 'Regenerate Story',
    regenerateVideo: 'Regenerate Video',
    moralLesson: 'Moral Lesson',
    bibleReference: 'Bible Reference',
    storyScript: 'Story Script',
    sceneTimeline: 'Animated Scenes',
    historyTitle: 'Story History',
    historyEmpty: 'No stories generated yet. Click Generate Story & Video to create your first animated Bible story.',
    loadProject: 'Open in Studio',
    deleteProject: 'Remove',
    emptyStageTitle: 'Ready to Animate a New Bible Story',
    emptyStageSubtitle: 'Generates an original 2–3 minute kids Bible story, expressive voice narration, balanced magical music, and full animated video.',
    approvalTitle: 'YouTube Publishing & Approval Studio',
    copyMetadata: 'Copy Metadata',
    copied: 'Copied',
    uploadYoutube: 'Upload to YouTube',
    uploading: 'Preparing Package...',
    voicePreviewTitle: 'Voice Preview Studio',
    speakerLabel: 'Speaker',
    previewTextLabel: 'Preview Script',
    generatePreviewBtn: 'Generate Voice Preview',
    schedulingTitle: 'Publishing Schedule',
    scheduledDate: 'Scheduled Date',
    scheduledTime: 'Scheduled Time',
    timezone: 'Timezone',
  },
  ta: {
    appTitle: 'Bible Kids Video Creator',
    navStudio: 'ஸ்டுடியோ',
    navScript: 'கதை & காட்சிகள்',
    navHistory: 'வரலாறு',
    generateBtn: 'கதை & வீடியோ உருவாக்கு',
    generatingBtn: 'உருவாக்கப்படுகிறது...',
    storyLanguage: 'கதை மொழி',
    voiceStyle: 'குரல் வகை',
    themeLabel: 'கதை தலைப்பு (விருப்பம்)',
    themePlaceholder: 'எ.கா., நோவாவின் வானவில், அன்பு, தாவீது...',
    statusLabel: 'வீடியோ நிலை',
    titleLabel: 'கதை தலைப்பு',
    languageLabel: 'மொழி',
    durationLabel: 'கால அளவு',
    createdLabel: 'உருவாக்கிய தேதி',
    approveBtn: 'APPROVE',
    play: 'இயக்கு',
    pause: 'நிறுத்து',
    fullscreen: 'முழு திரை',
    downloadVideo: 'வீடியோ பதிவிறக்கு',
    downloadAudio: 'குரல் பதிவிறக்கு',
    downloadMusic: 'இசை பதிவிறக்கு',
    downloadScript: 'கதை பதிவிறக்கு',
    regenerateStory: 'புதிய கதை',
    regenerateVideo: 'வீடியோ மீண்டும் உருவாக்கு',
    moralLesson: 'நல்லொழுக்க பாடம்',
    bibleReference: 'வேதாகம குறிப்பு',
    storyScript: 'முழு கதை',
    sceneTimeline: 'அனிமேஷன் காட்சிகள்',
    historyTitle: 'கதை வரலாறு',
    historyEmpty: 'இன்னும் கதைகள் எதுவும் உருவாக்கப்படவில்லை. தொடங்க Generate Story & Video பொத்தானை அழுத்தவும்.',
    loadProject: 'திறக்கவும்',
    deleteProject: 'நீக்கு',
    emptyStageTitle: 'புதிய வேதாகம அனிமேஷன் கதையை உருவாக்க தயாராக உள்ளது',
    emptyStageSubtitle: 'குழந்தைகளுக்கான 2–3 நிமிட கதை, இனிமையான குரல், பின்னணி இசை மற்றும் முழு அனிமேஷன் வீடியோவை உருவாக்குகிறது.',
    approvalTitle: 'YouTube வெளியீடு & ஒப்புதல்',
    copyMetadata: 'விவரங்களை நகலெடு',
    copied: 'நகலெடுக்கப்பட்டது',
    uploadYoutube: 'Upload to YouTube',
    uploading: 'தயாராகிறது...',
    voicePreviewTitle: 'குரல் முன்னோட்டம்',
    speakerLabel: 'பேச்சாளர்',
    previewTextLabel: 'மாதிரி உரை',
    generatePreviewBtn: 'Generate Voice Preview',
    schedulingTitle: 'வெளியீட்டு அட்டவணை',
    scheduledDate: 'தேதி',
    scheduledTime: 'நேரம்',
    timezone: 'நேர மண்டலம்',
  },
};
