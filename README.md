# MIDI Vocal Trainer

MIDIの正解ノートと録音した声のピッチを時間軸で照合する、ボーカル練習用Webアプリです。

## Features

- MIDIファイルのアップロード
- トラック名、音域、ノート数からのベース候補表示
- デモ用ベースMIDIの即時読み込み
- ブラウザ録音
- pitchyによるクライアント内ピッチ推定
- 音名一致率、平均centズレ、入りのズレ、長さのズレ、安定度の診断
- ピアノロールと検出ピッチグラフ

## Tech Stack

- Vite
- React
- TypeScript
- @tonejs/midi
- pitchy
- Recharts
- lucide-react

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploying to Vercel

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
