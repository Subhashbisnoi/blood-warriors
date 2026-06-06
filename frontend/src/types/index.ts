export interface DashboardStats {
  active_bridges: number;
  eligible_donors: number;
  open_matches: number;
  escalations: number;
  inactive_donors: number;
}

export interface BloodInventoryItem {
  blood_group: string;
  eligible_active: number;
  eligible_inactive: number;
  bridge_count: number;
  supply_status: 'Critical' | 'Low' | 'Adequate';
  rarity: string;
}

export interface InactiveDonor {
  id: string;
  user_id_hash: string;
  blood_group: string;
  last_donation_date: string | null;
  last_contacted_date: string | null;
  inactive_trigger_comment: string | null;
  preferred_channel: string | null;
  calls_to_donations_ratio: number;
}

export interface ActiveBridge {
  bridge_id: string;
  bridge_blood_group: string;
  patient_blood_group: string;
  expected_next_transfusion_date: string;
  days_until: number;
  quantity_required: number;
  confirmed_donors: number;
  total_donors: number;
  donor_count: number;
  urgency: string;
}

export interface ActivityEvent {
  event_type: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface MatchRequest {
  blood_group: string;
  transfusion_date: string;
  patient_lat: number;
  patient_lon: number;
  quantity_required: number;
  bridge_id?: string;
}

export interface DonorCandidate {
  user_id_hash_short: string;
  blood_group: string;
  rank: number;
  score: number;
  ml_score: number;
  churn_risk: number;
  needs_reengagement: boolean;
  tier: 'Tier1' | 'Tier2' | 'Reserve';
  distance_km: number | null;
  latitude: number | null;
  longitude: number | null;
  donor_type: string;
  donations_till_date: number;
  next_eligible_date: string | null;
  explanation?: string;
  source?: string;
}

export interface MatchResponse {
  match_id: string;
  status: string;
  candidates: DonorCandidate[];
  total_scanned: number;
  total_pool_searched?: number;
}

export interface OutreachEvent {
  event_id: string;
  candidate_rank: number;
  user_hash: string;
  event_type: 'whatsapp_sent' | 'confirmed' | 'declined' | 'no_response' | 'escalated' | 'followup_sent';
  timestamp: string;
}

export interface AuditLogEntry {
  log_id: string;
  donor_user_id: string | null;
  channel: string;
  message_body: string | null;
  sent_at: string | null;
  response: 'CONFIRM' | 'DECLINE' | 'OPT_OUT' | 'NO_RESPONSE' | 'QUESTION_LOGISTICS' | null;
  response_text: string | null;
  response_at: string | null;
  response_latency_secs: number | null;
  twilio_sid: string | null;
}

export interface OutreachCandidate {
  donor_user_id: string | null;
  rank: number;
  kag_score: number | null;
  tier: string | null;
  outreach_status: string | null;
  contacted_at: string | null;
  distance_km: number | null;
  explanation: string | null;
}

export interface OutreachSession {
  match_id: string;
  status: 'in_progress' | 'confirmed' | 'escalated' | 'pending' | string;
  events: OutreachEvent[];
  audit_log: AuditLogEntry[];
  candidates: OutreachCandidate[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  timestamp?: string;
}

export interface DonorProfile {
  user_id: string;
  blood_group: string;
  donor_type: string;
  eligibility_status: string;
  user_donation_active_status: string;
  donations_till_date: number;
  last_donation_date: string | null;
  next_eligible_date: string | null;
  latitude: number;
  longitude: number;
  calls_to_donations_ratio: number;
}

export interface AnalyticsData {
  success_rate: number;
  avg_steps: number;
  calls_per_donation: number;
  reengaged_count: number;
  channel_performance: { channel: string; rate: number }[];
  blood_group_outcomes: { blood_group: string; count: number; pct: number }[];
}
