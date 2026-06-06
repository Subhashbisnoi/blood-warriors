import axios from 'axios';

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/donor-portal';

export interface DonationRecord {
  id: string; date: string; units: number; location: string;
  blood_group: string; type: string; status: string; recipient_saved: boolean;
}

export interface GratitudeMessage {
  id: string; from_patient: string; blood_group: string;
  message: string; city: string; date: string; lives_saved_moment: boolean;
}

export interface DonorProfile {
  id: string; hash: string; blood_group: string; city: string; gender: string;
  donor_type: string; donations_till_date: number;
  last_donation_date: string | null; next_eligible_date: string | null;
  kag_score: number | null; donor_tier: string; eligibility_status: string;
  donation_history: DonationRecord[];
  gratitude_messages: GratitudeMessage[];
  lives_saved: number;
}

export async function donorLogin(hashId: string): Promise<{ access_token: string; profile: DonorProfile }> {
  const res = await axios.post(`${BASE}/login`, { hash_id: hashId });
  return res.data;
}

export function saveDonorSession(token: string, profile: DonorProfile) {
  localStorage.setItem('bw_donor_token', token);
  localStorage.setItem('bw_donor_profile', JSON.stringify(profile));
}

export function getDonorToken()   { return localStorage.getItem('bw_donor_token'); }
export function getDonorProfile(): DonorProfile | null {
  try { const r = localStorage.getItem('bw_donor_profile'); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
export function clearDonorSession() {
  localStorage.removeItem('bw_donor_token');
  localStorage.removeItem('bw_donor_profile');
  localStorage.removeItem('bw_token');
}
