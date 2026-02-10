import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import type { Env, ReportInitRequest, ReportCompleteRequest } from '../types';
import { authMiddleware } from '../auth';

const reports = new Hono<{ Bindings: Env }>();

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
 * Initialize report and return signed upload URLs
 */
reports.post('/init', authMiddleware, async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'User ID not found in token' }, 401);
  }

  const supabaseUrl = c.env.SUPABASE_URL;
  const serviceRoleKey = c.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
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

  const audioPath = `${reportId}/system_audio.wav`;
  const { data: audioSigned, error: audioError } = await supabase.storage
    .from('reports-audio')
    .createSignedUploadUrl(audioPath);

  if (audioError || !audioSigned?.signedUrl) {
    console.error('Audio signed upload error:', audioError);
    return c.json({ error: 'Failed to create audio upload URL' }, 500);
  }

  let microphoneUploadUrl: string | null = null;
  let microphoneUploadToken: string | null = null;
  let microphonePath: string | null = null;
  if (body.has_microphone) {
    microphonePath = `${reportId}/microphone.wav`;
    const { data: micSigned, error: micError } = await supabase.storage
      .from('reports-audio')
      .createSignedUploadUrl(microphonePath);
    if (micError || !micSigned?.signedUrl) {
      console.error('Microphone signed upload error:', micError);
      return c.json({ error: 'Failed to create microphone upload URL' }, 500);
    }
    microphoneUploadUrl = micSigned.signedUrl;
    microphoneUploadToken = micSigned.token ?? null;
  }

  let videoUploadUrl: string | null = null;
  let videoUploadToken: string | null = null;
  let videoPath: string | null = null;
  if (body.has_video) {
    videoPath = `${reportId}/screen_recording.avi`;
    const { data: videoSigned, error: videoError } = await supabase.storage
      .from('reports-video')
      .createSignedUploadUrl(videoPath);
    if (videoError || !videoSigned?.signedUrl) {
      console.error('Video signed upload error:', videoError);
      return c.json({ error: 'Failed to create video upload URL' }, 500);
    }
    videoUploadUrl = videoSigned.signedUrl;
    videoUploadToken = videoSigned.token ?? null;
  }

  return c.json({
    report_id: reportId,
    audio_upload_url: audioSigned.signedUrl,
    audio_upload_token: audioSigned.token,
    audio_path: audioPath,
    microphone_upload_url: microphoneUploadUrl,
    microphone_upload_token: microphoneUploadToken,
    microphone_path: microphonePath,
    video_upload_url: videoUploadUrl,
    video_upload_token: videoUploadToken,
    video_path: videoPath
  });
});

/**
 * POST /reports/complete
 * Insert report row after uploads are done
 */
reports.post('/complete', authMiddleware, async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'User ID not found in token' }, 401);
  }

  const supabaseUrl = c.env.SUPABASE_URL;
  const serviceRoleKey = c.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return c.json({ error: 'Server configuration error' }, 500);
  }

  let body: ReportCompleteRequest;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.report_id) {
    return c.json({ error: 'Missing report_id' }, 400);
  }

  const supabase = createSupabaseClient(c);

  const audioPaths = [body.audio_path, body.microphone_path].filter(Boolean).join(',');

  const reportData = {
    id: body.report_id,
    user_id: userId,
    game_name: body.game_name || null,
    offender_name: body.offender_name || null,
    description: body.description || null,
    targeted: body.targeted !== undefined ? body.targeted : null,
    desired_action: body.desired_action || null,
    recording_start_utc: body.recording_start_utc || null,
    flag_utc: body.flag_utc || null,
    clip_start_offset_sec: body.clip_start_offset_sec !== undefined ? body.clip_start_offset_sec : null,
    clip_end_offset_sec: body.clip_end_offset_sec !== undefined ? body.clip_end_offset_sec : null,
    audio_path: audioPaths || null,
    video_path: body.video_path || null,
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

  return c.json({
    ok: true,
    report_id: body.report_id
  }, 201);
});

/**
 * POST /reports (legacy)
 */
reports.post('/', authMiddleware, async (c) => {
  return c.json({ error: 'Use /reports/init and /reports/complete' }, 400);
});

export default reports;

