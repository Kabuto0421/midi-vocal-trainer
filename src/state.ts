import type {
  AnalysisResult,
  MidiProject,
  PracticeSession,
  RecorderHandle,
  RecordingTake,
  TrackCandidate,
} from "./types";
import { buildPracticeChart, buildTrackCandidates } from "./music";

export type AppState =
  | { type: "Empty" }
  | { type: "LoadingMidi"; fileName: string }
  | {
      type: "TrackSelect";
      project: MidiProject;
      candidates: TrackCandidate[];
    }
  | { type: "Ready"; session: PracticeSession }
  | {
      type: "CountIn";
      session: PracticeSession;
      countInStartedAt: number;
      beats: number;
    }
  | {
      type: "Recording";
      session: PracticeSession;
      recordingStartedAt: number;
      recorder: RecorderHandle;
    }
  | { type: "Analyzing"; session: PracticeSession; take: RecordingTake }
  | {
      type: "Result";
      session: PracticeSession;
      take: RecordingTake;
      result: AnalysisResult;
    }
  | { type: "Error"; message: string; recoverTo: AppState };

export type AppEvent =
  | { type: "MidiFileDropped"; fileName: string }
  | { type: "MidiLoaded"; project: MidiProject; candidates: TrackCandidate[] }
  | { type: "MidiLoadFailed"; message: string }
  | { type: "TrackSelected"; trackId: string }
  | { type: "StartRequested" }
  | { type: "RecordingStarted"; recorder: RecorderHandle; startedAt: number }
  | { type: "RecordingFinished"; take: RecordingTake }
  | { type: "AnalysisFinished"; result: AnalysisResult }
  | { type: "RetryRequested" }
  | { type: "ChangeTrackRequested" }
  | { type: "ResetRequested" }
  | { type: "RecoverRequested" };

export function transition(state: AppState, event: AppEvent): AppState {
  if (event.type === "MidiLoadFailed" && state.type !== "Error") {
    return {
      type: "Error",
      message: event.message,
      recoverTo: state.type === "LoadingMidi" ? { type: "Empty" } : state,
    };
  }

  switch (state.type) {
    case "Empty":
      if (event.type === "MidiFileDropped") {
        return { type: "LoadingMidi", fileName: event.fileName };
      }
      return state;

    case "LoadingMidi":
      if (event.type === "MidiLoaded") {
        return {
          type: "TrackSelect",
          project: event.project,
          candidates: event.candidates,
        };
      }
      return state;

    case "TrackSelect":
      if (event.type === "TrackSelected") {
        const chart = buildPracticeChart(state.project, event.trackId);
        return {
          type: "Ready",
          session: {
            project: state.project,
            selectedTrackId: event.trackId,
            chart,
          },
        };
      }
      if (event.type === "ResetRequested") {
        return { type: "Empty" };
      }
      return state;

    case "Ready":
      if (event.type === "StartRequested") {
        return {
          type: "CountIn",
          session: state.session,
          countInStartedAt: performance.now(),
          beats: 4,
        };
      }
      if (event.type === "ChangeTrackRequested") {
        return {
          type: "TrackSelect",
          project: state.session.project,
          candidates: buildTrackCandidates(state.session.project),
        };
      }
      if (event.type === "ResetRequested") {
        return { type: "Empty" };
      }
      return state;

    case "CountIn":
      if (event.type === "RecordingStarted") {
        return {
          type: "Recording",
          session: state.session,
          recordingStartedAt: event.startedAt,
          recorder: event.recorder,
        };
      }
      if (event.type === "ResetRequested") {
        return { type: "Ready", session: state.session };
      }
      return state;

    case "Recording":
      if (event.type === "RecordingFinished") {
        return { type: "Analyzing", session: state.session, take: event.take };
      }
      return state;

    case "Analyzing":
      if (event.type === "AnalysisFinished") {
        return {
          type: "Result",
          session: state.session,
          take: state.take,
          result: event.result,
        };
      }
      return state;

    case "Result":
      if (event.type === "RetryRequested") {
        return { type: "Ready", session: state.session };
      }
      if (event.type === "ChangeTrackRequested") {
        return {
          type: "TrackSelect",
          project: state.session.project,
          candidates: buildTrackCandidates(state.session.project),
        };
      }
      if (event.type === "ResetRequested") {
        return { type: "Empty" };
      }
      return state;

    case "Error":
      if (event.type === "RecoverRequested") {
        return state.recoverTo;
      }
      if (event.type === "ResetRequested") {
        return { type: "Empty" };
      }
      return state;
  }
}
