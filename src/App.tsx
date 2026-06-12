import { useEffect, useMemo, useReducer, useRef } from "react";
import {
  Activity,
  AudioWaveform,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  FileAudio,
  Mic,
  RotateCcw,
  Square,
  Upload,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { analyzeTake, startRecording } from "./audio";
import {
  buildTrackCandidates,
  createDemoMidiProject,
  formatTime,
  parseMidiProject,
} from "./music";
import { transition, type AppState } from "./state";
import type { AnalysisResult, NoteEvent, PracticeSession } from "./types";

const initialState: AppState = { type: "Empty" };

export function App() {
  const [state, dispatch] = useReducer(transition, initialState);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (state.type !== "CountIn") {
      return;
    }

    const timeout = window.setTimeout(() => {
      startRecording((take) => dispatch({ type: "RecordingFinished", take }))
        .then(({ recorder, startedAt }) => {
          dispatch({ type: "RecordingStarted", recorder, startedAt });
        })
        .catch((error: unknown) => {
          dispatch({
            type: "MidiLoadFailed",
            message:
              error instanceof Error
                ? error.message
                : "マイクの開始に失敗しました",
          });
        });
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [state]);

  useEffect(() => {
    if (state.type !== "Analyzing") {
      return;
    }

    analyzeTake(state.session, state.take)
      .then((result) => dispatch({ type: "AnalysisFinished", result }))
      .catch((error: unknown) => {
        dispatch({
          type: "MidiLoadFailed",
          message:
            error instanceof Error ? error.message : "録音解析に失敗しました",
        });
      });
  }, [state]);

  const activeSession =
    state.type === "Ready" ||
    state.type === "CountIn" ||
    state.type === "Recording" ||
    state.type === "Analyzing" ||
    state.type === "Result"
      ? state.session
      : null;

  async function handleFile(file: File) {
    dispatch({ type: "MidiFileDropped", fileName: file.name });
    try {
      const project = parseMidiProject(await file.arrayBuffer(), file.name);
      dispatch({
        type: "MidiLoaded",
        project,
        candidates: buildTrackCandidates(project),
      });
    } catch (error) {
      dispatch({
        type: "MidiLoadFailed",
        message:
          error instanceof Error ? error.message : "MIDIファイルを読めませんでした",
      });
    }
  }

  function loadDemo() {
    const project = createDemoMidiProject();
    dispatch({ type: "MidiFileDropped", fileName: project.fileName });
    dispatch({
      type: "MidiLoaded",
      project,
      candidates: buildTrackCandidates(project),
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MIDI基準ピッチ診断</p>
          <h1>MIDI Vocal Trainer</h1>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            aria-label="MIDIを選択"
            title="MIDIを選択"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={20} />
          </button>
          <button className="secondary-button" onClick={loadDemo}>
            <FileAudio size={18} />
            Demo
          </button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept=".mid,.midi,audio/midi"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            void handleFile(file);
          }
          event.currentTarget.value = "";
        }}
      />

      <section
        className="drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) {
            void handleFile(file);
          }
        }}
      >
        <Upload size={22} />
        <span>MIDIをドロップ、またはDemoで開始</span>
      </section>

      {activeSession && <SessionOverview session={activeSession} />}

      {state.type === "Empty" && <EmptyPanel />}
      {state.type === "LoadingMidi" && (
        <StatusPanel label={`${state.fileName} を読み込み中`} />
      )}
      {state.type === "TrackSelect" && (
        <TrackSelectPanel
          state={state}
          onSelect={(trackId) => dispatch({ type: "TrackSelected", trackId })}
          onReset={() => dispatch({ type: "ResetRequested" })}
        />
      )}
      {state.type === "Ready" && (
        <ReadyPanel
          session={state.session}
          onStart={() => dispatch({ type: "StartRequested" })}
          onChangeTrack={() => dispatch({ type: "ChangeTrackRequested" })}
        />
      )}
      {state.type === "CountIn" && <StatusPanel label="カウント中" pulse />}
      {state.type === "Recording" && (
        <RecordingPanel onStop={() => state.recorder.stop()} />
      )}
      {state.type === "Analyzing" && <StatusPanel label="録音を解析中" pulse />}
      {state.type === "Result" && (
        <ResultPanel
          result={state.result}
          session={state.session}
          onRetry={() => dispatch({ type: "RetryRequested" })}
          onChangeTrack={() => dispatch({ type: "ChangeTrackRequested" })}
        />
      )}
      {state.type === "Error" && (
        <ErrorPanel
          message={state.message}
          onRecover={() => dispatch({ type: "RecoverRequested" })}
        />
      )}
    </main>
  );
}

function EmptyPanel() {
  return (
    <section className="hero-band">
      <div>
        <h2>MIDIの正解ラインに合わせて録音を診断</h2>
        <p>
          ベーストラックを選び、録音した声の音名・centズレ・入り・長さ・安定度を
          ノート単位で確認できます。
        </p>
      </div>
      <div className="signal-strip" aria-hidden="true">
        {Array.from({ length: 28 }, (_, index) => (
          <span
            key={index}
            style={{ height: `${24 + ((index * 19) % 58)}px` }}
          />
        ))}
      </div>
    </section>
  );
}

function TrackSelectPanel({
  state,
  onSelect,
  onReset,
}: {
  state: Extract<AppState, { type: "TrackSelect" }>;
  onSelect: (trackId: string) => void;
  onReset: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{state.project.fileName}</p>
          <h2>ベース候補を選択</h2>
        </div>
        <button className="ghost-button" onClick={onReset}>
          <RotateCcw size={18} />
          Reset
        </button>
      </div>
      <div className="track-grid">
        {state.candidates.map((track) => (
          <button
            key={track.id}
            className="track-card"
            onClick={() => onSelect(track.id)}
          >
            <span className="track-score">{track.score}</span>
            <strong>{track.name}</strong>
            <span>
              {track.noteCount} notes / {track.minNote} - {track.maxNote}
            </span>
            <span>{track.channelLabel}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ReadyPanel({
  session,
  onStart,
  onChangeTrack,
}: {
  session: PracticeSession;
  onStart: () => void;
  onChangeTrack: () => void;
}) {
  return (
    <section className="workspace">
      <PianoRoll notes={session.chart} />
      <div className="control-panel">
        <h2>録音準備完了</h2>
        <p>静かな環境で、表示されたノートラインに合わせて単音で歌ってください。</p>
        <button className="primary-button" onClick={onStart}>
          <Mic size={20} />
          録音開始
        </button>
        <button className="ghost-button" onClick={onChangeTrack}>
          <BarChart3 size={18} />
          トラック変更
        </button>
      </div>
    </section>
  );
}

function RecordingPanel({ onStop }: { onStop: () => void }) {
  return (
    <section className="recording-band">
      <AudioWaveform size={42} />
      <div>
        <h2>録音中</h2>
        <p>歌い終わったら停止してください。</p>
      </div>
      <button className="danger-button" onClick={onStop}>
        <Square size={18} />
        停止
      </button>
    </section>
  );
}

function ResultPanel({
  result,
  session,
  onRetry,
  onChangeTrack,
}: {
  result: AnalysisResult;
  session: PracticeSession;
  onRetry: () => void;
  onChangeTrack: () => void;
}) {
  const chartData = useMemo(
    () =>
      result.frames
        .filter((frame) => frame.frequency !== null)
        .map((frame) => ({
          time: Number(frame.time.toFixed(2)),
          midi: frame.midi,
        })),
    [result.frames],
  );

  return (
    <section className="result-stack">
      <div className="summary-grid">
        <Metric
          label="音名一致率"
          value={`${Math.round(result.summary.nameAccuracy * 100)}%`}
        />
        <Metric
          label="平均centズレ"
          value={
            result.summary.averageAbsCents === null
              ? "--"
              : `${Math.round(result.summary.averageAbsCents)}c`
          }
        />
        <Metric
          label="入りの平均"
          value={
            result.summary.averageOnsetOffsetMs === null
              ? "--"
              : `${Math.round(result.summary.averageOnsetOffsetMs)}ms`
          }
        />
        <Metric
          label="安定度"
          value={`${Math.round(result.summary.stabilityScore * 100)}%`}
        />
      </div>

      <div className="chart-panel">
        <div className="panel-heading">
          <h2>検出ピッチ</h2>
          <div className="button-row">
            <button className="primary-button" onClick={onRetry}>
              <Mic size={18} />
              もう一回
            </button>
            <button className="ghost-button" onClick={onChangeTrack}>
              トラック変更
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="#27303c" />
            <XAxis dataKey="time" stroke="#8c98a8" />
            <YAxis stroke="#8c98a8" domain={["dataMin - 2", "dataMax + 2"]} />
            <Tooltip
              contentStyle={{
                background: "#111827",
                border: "1px solid #334155",
                borderRadius: 6,
              }}
            />
            <Line
              type="monotone"
              dataKey="midi"
              stroke="#45d483"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <PianoRoll notes={session.chart} />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>正解</th>
              <th>検出</th>
              <th>判定</th>
              <th>平均</th>
              <th>入り</th>
              <th>長さ</th>
              <th>診断</th>
            </tr>
          </thead>
          <tbody>
            {result.notes.map((note) => (
              <tr key={note.noteId}>
                <td>{note.expectedName}</td>
                <td>{note.detectedName}</td>
                <td>
                  <span className={note.nameMatch ? "ok-pill" : "ng-pill"}>
                    {note.nameMatch ? "OK" : "NG"}
                  </span>
                </td>
                <td>
                  {note.averageCents === null
                    ? "--"
                    : `${Math.round(note.averageCents)}c`}
                </td>
                <td>
                  {note.onsetOffsetMs === null ? "--" : `${note.onsetOffsetMs}ms`}
                </td>
                <td>
                  {note.durationOffsetMs === null
                    ? "--"
                    : `${note.durationOffsetMs}ms`}
                </td>
                <td>{note.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PianoRoll({ notes }: { notes: NoteEvent[] }) {
  const minMidi = Math.min(...notes.map((note) => note.midi));
  const maxMidi = Math.max(...notes.map((note) => note.midi));
  const totalDuration = Math.max(
    ...notes.map((note) => note.start + note.duration),
    1,
  );
  const range = Math.max(1, maxMidi - minMidi);

  return (
    <div className="piano-roll">
      <div className="panel-heading">
        <h2>正解ノートライン</h2>
        <span>{formatTime(totalDuration)}</span>
      </div>
      <div className="roll-canvas">
        {notes.map((note) => (
          <div
            key={note.id}
            className="note-block"
            style={{
              left: `${(note.start / totalDuration) * 100}%`,
              width: `${Math.max(1.8, (note.duration / totalDuration) * 100)}%`,
              bottom: `${((note.midi - minMidi) / range) * 78 + 8}%`,
            }}
            title={`${note.name} ${formatTime(note.start)}`}
          >
            {note.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionOverview({ session }: { session: PracticeSession }) {
  const selectedTrack = session.project.tracks.find(
    (track) => track.id === session.selectedTrackId,
  );

  return (
    <section className="overview">
      <span>{session.project.fileName}</span>
      <span>{selectedTrack?.name ?? "Track"}</span>
      <span>{session.chart.length} notes</span>
      <span>{Math.round(session.project.bpm)} BPM</span>
    </section>
  );
}

function StatusPanel({ label, pulse = false }: { label: string; pulse?: boolean }) {
  return (
    <section className={`status-panel ${pulse ? "pulse" : ""}`}>
      <Activity size={28} />
      <h2>{label}</h2>
    </section>
  );
}

function ErrorPanel({
  message,
  onRecover,
}: {
  message: string;
  onRecover: () => void;
}) {
  return (
    <section className="error-panel">
      <CircleAlert size={30} />
      <div>
        <h2>処理に失敗しました</h2>
        <p>{message}</p>
      </div>
      <button className="primary-button" onClick={onRecover}>
        戻る
      </button>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <CheckCircle2 size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
