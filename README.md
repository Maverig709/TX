# TX — Ultra-Lightweight Web Messenger

Browser-based messenger. No installs. Works on Render.com.

## Features

- **Private Messages (DMs)** — Real-time text with emojis, typing indicator, delivery checkmark
- **File Sharing** — Drag-and-drop into chat; images show previews; documents/archives show icons
- **Group Audio Calls** — WebRTC voice rooms (up to ~10 people), mic on/off, speaker control

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Deploy to Render

1. Push this repo to GitHub
2. [Render Dashboard](https://dashboard.render.com) → New → Web Service
3. Connect your repo
4. Render will detect Node.js; use default build/start commands
5. Deploy

Or use the `render.yaml` blueprint: connect repo and Render will read the config.

## Usage

1. Enter your name and a room ID (e.g. `lobby`). Share the room ID with others.
2. Type messages, use the emoji button, or drag files into the chat.
3. Click the phone icon to join the group voice call; use mic and speaker toggles during the call.
