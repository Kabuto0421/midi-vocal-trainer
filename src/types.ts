export type NoteEvent = {
  id: string;
  midi: number;
  name: string;
  start: number;
  duration: number;
  velocity: number;
};

export type TrackCandidate = {
  id: string;
  name: string;
  noteCount: number;
  minNote: string;
  maxNote: string;
  score: number;
  channelLabel: string;
};

export type MidiProject = {
  fileName: string;
  duration: number;
  bpm: number;
  tracks: Array<{
    id: string;
    name: string;
    channelLabel: string;
    notes: NoteEvent[];
  }>;
};

export type PracticeSession = {
  project: MidiProject;
  selectedTrackId: string;
  chart: NoteEvent[];
};

export type RecordingTake = {
  blob: Blob;
  duration: number;
  recordedAt: number;
};

export type PitchFrame = {
  time: number;
  frequency: number | null;
  midi: number | null;
  noteName: string | null;
  centsFromNearest: number | null;
  clarity: number;
};

export type NoteDiagnosis = {
  noteId: string;
  expectedName: string;
  expectedMidi: number;
  detectedName: string;
  nameMatch: boolean;
  voicedRatio: number;
  averageCents: number | null;
  onsetOffsetMs: number | null;
  durationOffsetMs: number | null;
  driftCents: number | null;
  verdict: string;
};

export type AnalysisResult = {
  frames: PitchFrame[];
  notes: NoteDiagnosis[];
  summary: {
    nameAccuracy: number;
    averageAbsCents: number | null;
    averageOnsetOffsetMs: number | null;
    stabilityScore: number;
  };
};

export type RecorderHandle = {
  stop: () => void;
};
