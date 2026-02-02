// Environment bindings for Cloudflare Worker
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// JWT payload structure from Supabase
export interface SupabaseJWTPayload {
  sub: string; // user_id
  email?: string;
  role?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

// Report metadata for completion
export interface ReportCompleteRequest {
  report_id: string;
  description?: string;
  targeted?: boolean;
  desired_action?: string;
  recording_start_utc?: string;
  flag_utc?: string;
  clip_start_offset_sec?: number;
  clip_end_offset_sec?: number;
  audio_path?: string;
  microphone_path?: string;
  video_path?: string;
}

// Report init request for signed uploads
export interface ReportInitRequest {
  has_microphone?: boolean;
  has_video?: boolean;
}

// Database report record
export interface ReportRecord {
  id: string;
  created_at: string;
  user_id: string;
  description?: string;
  targeted?: boolean;
  desired_action?: string;
  recording_start_utc?: string;
  flag_utc?: string;
  clip_start_offset_sec?: number;
  clip_end_offset_sec?: number;
  audio_path?: string;
  video_path?: string;
  forwarded_to_modulate: boolean;
}

