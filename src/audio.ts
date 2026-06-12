import { PitchDetector } from "pitchy";
import type {
  AnalysisResult,
  NoteDiagnosis,
  PitchFrame,
  PracticeSession,
  RecorderHandle,
  RecordingTake,
} from "./types";
import { centsBetween, frequencyToMidi, midiToNoteName } from "./music";

const FRAME_SIZE = 2048;
const HOP_SIZE = 512;
const CLARITY_THRESHOLD = 0.82;

export async function startRecording(
  onFinished: (take: RecordingTake) => void,
): Promise<{ recorder: RecorderHandle; startedAt: number }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream);
  const startedAt = performance.now();

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    onFinished({
      blob,
      duration: (performance.now() - startedAt) / 1000,
      recordedAt: Date.now(),
    });
  };

  recorder.start();

  return {
    startedAt,
    recorder: {
      stop: () => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      },
    },
  };
}

export async function analyzeTake(
  session: PracticeSession,
  take: RecordingTake,
): Promise<AnalysisResult> {
  const arrayBuffer = await take.blob.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  await audioContext.close();

  const mono = mixToMono(audioBuffer);
  const frames = extractPitchFrames(mono, audioBuffer.sampleRate);
  const notes = session.chart.map((note) => diagnoseNote(note, frames));

  return {
    frames,
    notes,
    summary: buildSummary(notes),
  };
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      mono[index] += data[index] / buffer.numberOfChannels;
    }
  }

  return mono;
}

function extractPitchFrames(samples: Float32Array, sampleRate: number): PitchFrame[] {
  const detector = PitchDetector.forFloat32Array(FRAME_SIZE);
  const frames: PitchFrame[] = [];

  for (let offset = 0; offset + FRAME_SIZE < samples.length; offset += HOP_SIZE) {
    const slice = samples.subarray(offset, offset + FRAME_SIZE);
    const [frequency, clarity] = detector.findPitch(slice, sampleRate);
    const voiced = clarity >= CLARITY_THRESHOLD && frequency >= 45 && frequency <= 1000;
    const midiValue = voiced ? frequencyToMidi(frequency) : null;
    const nearestMidi = midiValue === null ? null : Math.round(midiValue);

    frames.push({
      time: offset / sampleRate,
      frequency: voiced ? frequency : null,
      midi: nearestMidi,
      noteName: nearestMidi === null ? null : midiToNoteName(nearestMidi),
      centsFromNearest:
        midiValue === null ? null : (midiValue - Math.round(midiValue)) * 100,
      clarity,
    });
  }

  return frames;
}

function diagnoseNote(
  note: PracticeSession["chart"][number],
  frames: PitchFrame[],
): NoteDiagnosis {
  const noteEnd = note.start + note.duration;
  const inWindow = frames.filter(
    (frame) => frame.time >= note.start && frame.time <= noteEnd,
  );
  const voiced = inWindow.filter((frame) => frame.frequency !== null);
  const matching = voiced.filter((frame) => frame.midi === note.midi);
  const cents = voiced
    .filter((frame) => frame.frequency !== null)
    .map((frame) => centsBetween(frame.frequency as number, note.midi));
  const averageCents = averageOrNull(cents);
  const onset = voiced[0]?.time ?? null;
  const lastVoiced = voiced[voiced.length - 1]?.time ?? null;
  const early = voiced.slice(0, Math.max(1, Math.floor(voiced.length / 3)));
  const late = voiced.slice(Math.floor((voiced.length * 2) / 3));
  const earlyCents = early
    .map((frame) =>
      frame.frequency === null ? null : centsBetween(frame.frequency, note.midi),
    )
    .filter(isNumber);
  const lateCents = late
    .map((frame) =>
      frame.frequency === null ? null : centsBetween(frame.frequency, note.midi),
    )
    .filter(isNumber);
  const earlyAverage = averageOrNull(earlyCents);
  const lateAverage = averageOrNull(lateCents);
  const driftCents =
    earlyAverage === null || lateAverage === null
      ? null
      : lateAverage - earlyAverage;
  const detectedMidi = mode(voiced.map((frame) => frame.midi).filter(isNumber));
  const nameMatch = voiced.length > 0 && matching.length / voiced.length >= 0.55;

  return {
    noteId: note.id,
    expectedName: note.name,
    expectedMidi: note.midi,
    detectedName: detectedMidi === null ? "未検出" : midiToNoteName(detectedMidi),
    nameMatch,
    voicedRatio: inWindow.length === 0 ? 0 : voiced.length / inWindow.length,
    averageCents,
    onsetOffsetMs: onset === null ? null : Math.round((onset - note.start) * 1000),
    durationOffsetMs:
      onset === null || lastVoiced === null
        ? null
        : Math.round((lastVoiced - onset - note.duration) * 1000),
    driftCents,
    verdict: buildVerdict(nameMatch, averageCents, driftCents, onset, note.start),
  };
}

function buildSummary(notes: NoteDiagnosis[]): AnalysisResult["summary"] {
  const attempted = notes.filter((note) => note.voicedRatio > 0.2);
  const matched = attempted.filter((note) => note.nameMatch);
  const absCents = attempted
    .map((note) => note.averageCents)
    .filter(isNumber)
    .map((value) => Math.abs(value));
  const onsets = attempted.map((note) => note.onsetOffsetMs).filter(isNumber);
  const drifts = attempted
    .map((note) => note.driftCents)
    .filter(isNumber)
    .map((value) => Math.abs(value));

  return {
    nameAccuracy: attempted.length === 0 ? 0 : matched.length / attempted.length,
    averageAbsCents: averageOrNull(absCents),
    averageOnsetOffsetMs: averageOrNull(onsets),
    stabilityScore: Math.max(0, 1 - (averageOrNull(drifts) ?? 100) / 100),
  };
}

function buildVerdict(
  nameMatch: boolean,
  averageCents: number | null,
  driftCents: number | null,
  onset: number | null,
  expectedStart: number,
): string {
  if (onset === null) {
    return "音が十分に検出されていません";
  }
  if (!nameMatch) {
    return "音名が正解から外れています";
  }
  if (averageCents !== null && averageCents < -25) {
    return "音名は合っていますが低めです";
  }
  if (averageCents !== null && averageCents > 25) {
    return "音名は合っていますが高めです";
  }
  if (driftCents !== null && driftCents < -30) {
    return "伸ばす途中で下がっています";
  }
  if ((onset - expectedStart) * 1000 > 80) {
    return "入りが少し遅れています";
  }
  return "安定しています";
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function averageOrNull(values: number[]): number | null {
  return values.length === 0 ? null : average(values);
}

function mode(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function isNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
