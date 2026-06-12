import { Midi } from "@tonejs/midi";
import type { MidiProject, NoteEvent, TrackCandidate } from "./types";

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function centsBetween(frequency: number, expectedMidi: number): number {
  const expectedFrequency = 440 * 2 ** ((expectedMidi - 69) / 12);
  return 1200 * Math.log2(frequency / expectedFrequency);
}

export function parseMidiProject(buffer: ArrayBuffer, fileName: string): MidiProject {
  const midi = new Midi(buffer);
  const tracks = midi.tracks
    .map((track, trackIndex) => {
      const notes: NoteEvent[] = track.notes.map((note, noteIndex) => ({
        id: `${trackIndex}-${noteIndex}`,
        midi: note.midi,
        name: midiToNoteName(note.midi),
        start: note.time,
        duration: note.duration,
        velocity: note.velocity,
      }));

      return {
        id: String(trackIndex),
        name: track.name || `Track ${trackIndex + 1}`,
        channelLabel:
          typeof track.channel === "number"
            ? `Ch ${track.channel + 1}`
            : "No channel",
        notes,
      };
    })
    .filter((track) => track.notes.length > 0);

  const bpm = midi.header.tempos[0]?.bpm ?? 120;

  return {
    fileName,
    duration: midi.duration,
    bpm,
    tracks,
  };
}

export function buildTrackCandidates(project: MidiProject): TrackCandidate[] {
  return project.tracks
    .map((track) => {
      const midiValues = track.notes.map((note) => note.midi);
      const minMidi = Math.min(...midiValues);
      const maxMidi = Math.max(...midiValues);
      const averageMidi =
        midiValues.reduce((total, value) => total + value, 0) / midiValues.length;
      const nameScore = /bass|ベース|低音/i.test(track.name) ? 80 : 0;
      const rangeScore = averageMidi >= 35 && averageMidi <= 58 ? 50 : 0;
      const densityScore = Math.min(30, track.notes.length / 8);

      return {
        id: track.id,
        name: track.name,
        noteCount: track.notes.length,
        minNote: midiToNoteName(minMidi),
        maxNote: midiToNoteName(maxMidi),
        score: Math.round(nameScore + rangeScore + densityScore),
        channelLabel: track.channelLabel,
      };
    })
    .sort((a, b) => b.score - a.score || b.noteCount - a.noteCount);
}

export function buildPracticeChart(
  project: MidiProject,
  trackId: string,
): NoteEvent[] {
  return project.tracks.find((track) => track.id === trackId)?.notes ?? [];
}

export function createDemoMidiProject(): MidiProject {
  const midi = new Midi();
  midi.header.setTempo(88);
  const track = midi.addTrack();
  track.name = "Demo Bass";
  track.channel = 4;

  [
    [40, 0, 0.75],
    [43, 1, 0.75],
    [45, 2, 0.75],
    [47, 3, 0.75],
    [40, 4, 1],
    [38, 5.25, 0.75],
    [36, 6, 1.5],
    [40, 8, 0.75],
    [43, 9, 0.75],
    [45, 10, 0.75],
    [48, 11, 0.75],
  ].forEach(([note, time, duration]) => {
    track.addNote({
      midi: note,
      time,
      duration,
      velocity: 0.85,
    });
  });

  const bytes = midi.toArray();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return parseMidiProject(buffer, "demo-bass.mid");
}

export function formatTime(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}
