export type StoryLanguage = 'English' | 'Tamil';

export type UILocale = 'en' | 'ta';

export type VoiceOption =
  | 'Cute Narrator'
  | 'Girl Character'
  | 'Boy Character'
  | 'Animal Character';

export type VideoStatus =
  | 'Idle'
  | 'Generating'
  | 'Processing'
  | 'Completed'
  | 'Failed';

export type SceneEnvironment =
  | 'meadow'
  | 'village'
  | 'waterfront'
  | 'desert_oasis'
  | 'starry_night'
  | 'hilltop'
  | 'garden'
  | 'rainbow_sky';

export type TimeOfDay =
  | 'morning'
  | 'golden_hour'
  | 'noon'
  | 'twilight'
  | 'starlight';

export type WeatherEffect =
  | 'sunbeams'
  | 'fireflies'
  | 'petals'
  | 'rain_to_rainbow'
  | 'ripples'
  | 'sparkles';

export type CameraMove =
  | 'pan_right'
  | 'pan_left'
  | 'zoom_in'
  | 'zoom_out'
  | 'dolly_follow'
  | 'crane_up';

export type TransitionType =
  | 'iris_open'
  | 'cross_dissolve'
  | 'wipe_horizon'
  | 'sunburst';

export type SceneCharacterKind =
  | 'boy'
  | 'girl'
  | 'shepherd'
  | 'lamb'
  | 'dove'
  | 'lion'
  | 'fish'
  | 'donkey'
  | 'angel';

export type CharacterAction =
  | 'walking'
  | 'waving'
  | 'jumping'
  | 'praying'
  | 'celebrating'
  | 'flying'
  | 'swimming'
  | 'listening';

export type CharacterMood =
  | 'happy'
  | 'curious'
  | 'amazed'
  | 'gentle'
  | 'brave'
  | 'joyful';

export interface SceneCharacter {
  name: string;
  kind: SceneCharacterKind;
  action: CharacterAction;
  mood: CharacterMood;
  primaryColor: string;
  startX: number;
  endX: number;
}

export interface StoryScene {
  sceneNumber: number;
  title: string;
  narrationSegment: string;
  subtitleCaption: string;
  environment: SceneEnvironment;
  timeOfDay: TimeOfDay;
  weatherEffect: WeatherEffect;
  cameraMove: CameraMove;
  transitionIn: TransitionType;
  characters: SceneCharacter[];
}

export interface MusicProfile {
  key: 'C_major' | 'G_major' | 'F_major';
  tempoBpm: number;
  mood: 'gentle_wonder' | 'joyful_adventure' | 'peaceful_lullaby';
}

export interface GeneratedStory {
  id: string;
  title: string;
  bibleReference: string;
  moralLesson: string;
  narrationScript: string;
  language: StoryLanguage;
  voiceOption: VoiceOption;
  theme?: string;
  scenes: StoryScene[];
  musicProfile: MusicProfile;
  createdAt: string;
  estimatedDurationSec: number;
}

export interface YouTubeMetadata {
  title: string;
  description: string;
  keywords: string[];
  hashtags: string[];
  category: string;
  targetAudience: string;
  estimatedDuration: string;
  thumbnailPrompt: string;
  tags: string[];
  publishingNotes: string;
}

export type YouTubePrivacyMode = 'scheduled' | 'public' | 'unlisted' | 'private';

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  customUrl: string;
  thumbnailUrl?: string;
  subscriberCount?: string;
  matchesTargetChannel: boolean;
}

export interface PublishPayload {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  category: string;
  thumbnailPrompt: string;
  scheduledDate: string;
  scheduledTime: string;
  timezone?: string;
  privacyMode?: YouTubePrivacyMode;
  videoUrl: string;
}

export interface PublishResult {
  publishId: string;
  videoId?: string;
  youtubeUrl?: string;
  studioUrl?: string;
  channelTitle?: string;
  channelHandle?: string;
  publishedAt: string;
  scheduledIso: string;
  status: 'Scheduled' | 'Uploaded' | 'Ready';
  payload: PublishPayload;
}

export interface StoryProjectRecord {
  id: string;
  story: GeneratedStory;
  durationSeconds: number;
  status: VideoStatus;
  videoMimeType?: string;
  youtubeMetadata?: YouTubeMetadata;
  publishResult?: PublishResult;
}
