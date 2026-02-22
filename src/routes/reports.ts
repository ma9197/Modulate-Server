import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import type { Env, ReportInitRequest, ReportCompleteRequest } from '../types';
import { authMiddleware } from '../auth';

const reports = new Hono<{ Bindings: Env }>();

// ── Storage bucket names ────────────────────────────────────────────────────
const BUCKET_AUDIO_DESKTOP = 'reports-audio';      // system / loopback audio
const BUCKET_AUDIO_MIC     = 'reports-audio-mic';  // microphone audio
const BUCKET_VIDEO         = 'reports-video';       // screen recording

// ── File-name helpers ────────────────────────────────────────────────────────

/** 6-character lowercase alphanumeric ID using crypto.getRandomValues */
function generateId(length = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

/**
 * Builds a unique storage file name.
 * Format: {yyyyMMdd_HHmmss}_{6-char-id}{ext}
 * Example: 20260222_143045_a3f7x2.wav
 */
function generateFileName(ext: string, at?: Date): string {
  const d = at ?? new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return `${date}_${time}_${generateId()}${ext}`;
}

function createSupabaseClient(c: { env: Env }) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * POST /reports/init
 * Initialise a report and return signed upload URLs for each media file.
 *
 * Three separate buckets:
 *   reports-audio     → desktop / system-loopback audio
 *   reports-audio-mic → microphone audio
 *   reports-video     → screen recording
 *
 * File naming: {yyyyMMdd_HHmmss}_{6charId}.ext
 */
reports.post('/init', authMiddleware, async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'User ID not found in token' }, 401);
  }

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return c.json({ error: 'Server configuration error' }, 500);
  }

  let body: ReportInitRequest = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const reportId = crypto.randomUUID();
  const supabase = createSupabaseClient(c);
  const now = new Date();

  // ── Desktop audio (required) ───────────────────────────────────────────────
  const audioFileName = generateFileName('.wav', now);
  const audioPath = `${reportId}/${audioFileName}`;

  const { data: audioSigned, error: audioError } = await supabase.storage
    .from(BUCKET_AUDIO_DESKTOP)
    .createSignedUploadUrl(audioPath);

  if (audioError || !audioSigned?.signedUrl) {
    console.error('Desktop-audio signed upload error:', audioError);
    return c.json({ error: 'Failed to create desktop audio upload URL' }, 500);
  }

  // ── Microphone audio (optional) ────────────────────────────────────────────
  let microphoneUploadUrl: string | null = null;
  let microphoneUploadToken: string | null = null;
  let microphonePath: string | null = null;

  if (body.has_microphone) {
    const micFileName = generateFileName('.wav', now);
    microphonePath = `${reportId}/${micFileName}`;

    const { data: micSigned, error: micError } = await supabase.storage
      .from(BUCKET_AUDIO_MIC)
      .createSignedUploadUrl(microphonePath);

    if (micError || !micSigned?.signedUrl) {
      console.error('Microphone signed upload error:', micError);
      return c.json({ error: 'Failed to create microphone upload URL' }, 500);
    }

    microphoneUploadUrl   = micSigned.signedUrl;
    microphoneUploadToken = micSigned.token ?? null;
  }

  // ── Video (optional) ───────────────────────────────────────────────────────
  let videoUploadUrl: string | null = null;
  let videoUploadToken: string | null = null;
  let videoPath: string | null = null;

  if (body.has_video) {
    const videoFileName = generateFileName('.avi', now);
    videoPath = `${reportId}/${videoFileName}`;

    const { data: videoSigned, error: videoError } = await supabase.storage
      .from(BUCKET_VIDEO)
      .createSignedUploadUrl(videoPath);

    if (videoError || !videoSigned?.signedUrl) {
      console.error('Video signed upload error:', videoError);
      return c.json({ error: 'Failed to create video upload URL' }, 500);
    }

    videoUploadUrl   = videoSigned.signedUrl;
    videoUploadToken = videoSigned.token ?? null;
  }

  return c.json({
    report_id:              reportId,
    audio_upload_url:       audioSigned.signedUrl,
    audio_upload_token:     audioSigned.token,
    audio_path:             audioPath,
    microphone_upload_url:  microphoneUploadUrl,
    microphone_upload_token: microphoneUploadToken,
    microphone_path:        microphonePath,
    video_upload_url:       videoUploadUrl,
    video_upload_token:     videoUploadToken,
    video_path:             videoPath
  });
});

/**
 * POST /reports/complete
 * Insert a report row after all uploads are done.
 * audio_path, microphone_path and video_path are stored as separate columns.
 */
reports.post('/complete', authMiddleware, async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'User ID not found in token' }, 401);
  }

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return c.json({ error: 'Server configuration error' }, 500);
  }

  let body: ReportCompleteRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.report_id) {
    return c.json({ error: 'Missing report_id' }, 400);
  }

  const supabase = createSupabaseClient(c);

  const reportData = {
    id:                    body.report_id,
    user_id:               userId,
    game_name:             body.game_name             || null,
    offender_name:         body.offender_name         || null,
    description:           body.description           || null,
    targeted:              body.targeted              ?? null,
    desired_action:        body.desired_action        || null,
    recording_start_utc:   body.recording_start_utc  || null,
    flag_utc:              body.flag_utc              || null,
    clip_start_offset_sec: body.clip_start_offset_sec ?? null,
    clip_end_offset_sec:   body.clip_end_offset_sec   ?? null,
    // Three separate storage paths (different buckets)
    audio_path:            body.audio_path            || null,
    microphone_path:       body.microphone_path       || null,
    video_path:            body.video_path            || null,
    forwarded_to_modulate: false
  };

  const { error } = await supabase
    .from('reports')
    .insert(reportData);

  if (error) {
    console.error('Database error:', error);
    return c.json({
      error: 'Failed to create report',
      details: error.message
    }, 500);
  }

  return c.json({ ok: true, report_id: body.report_id }, 201);
});

/**
 * POST /reports (legacy)
 */
reports.post('/', authMiddleware, async (c) => {
  return c.json({ error: 'Use /reports/init and /reports/complete' }, 400);
});

export default reports;
