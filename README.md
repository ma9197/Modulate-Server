# Toxicity Reporter API

Cloudflare Worker that validates Supabase access tokens and writes reports to Supabase (DB + Storage).

## Run locally

Install dependencies:

```bash
npm install
```

Create `Server/.dev.vars`:

```
SUPABASE_URL=https://project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SERVICE_ROLE_KEY_HERE
```

```bash
npm run dev
```

Server runs on `http://localhost:8787`.

Quick test:

```bash
curl http://localhost:8787/health
```

## API Endpoints

### `GET /health`

Health check endpoint.

```json
{"ok": true}
```

### `POST /reports/init`

Returns signed upload URLs (and tokens) for Storage. The client uploads blobs directly to Supabase.

Request (JSON):

```json
{ "has_microphone": true, "has_video": true }
```

Response (JSON):

```json
{
  "report_id": "uuid",
  "audio_upload_url": "https://...",
  "audio_upload_token": "jwt",
  "audio_path": "uuid/system_audio.wav",
  "microphone_upload_url": "https://...",
  "microphone_upload_token": "jwt",
  "microphone_path": "uuid/microphone.wav",
  "video_upload_url": "https://...",
  "video_upload_token": "jwt",
  "video_path": "uuid/screen_recording.avi"
}
```

### `POST /reports/complete`

Inserts the report row after uploads complete.

Request (JSON):

```json
{
  "report_id": "uuid",
  "description": "text",
  "targeted": true,
  "desired_action": "text",
  "recording_start_utc": "2026-02-01T12:00:00Z",
  "flag_utc": "2026-02-01T12:00:10Z",
  "clip_start_offset_sec": 0,
  "clip_end_offset_sec": 10,
  "audio_path": "uuid/system_audio.wav",
  "microphone_path": "uuid/microphone.wav",
  "video_path": "uuid/screen_recording.avi"
}
```

## Deployment

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

```bash
wrangler deploy
```

## Notes

- The signed upload URL also requires `Authorization: Bearer <upload_token>` from `/reports/init`.
- `Server/.dev.vars` is local-only and should not be committed.

