import axios from 'axios';

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/patient';

export interface PatientProfile {
  name: string;
  email: string;
  age: number;
  height_cm: number;
  weight_kg: number;
  blood_group: string;
  bmi: number;
  bmi_label: string;
}

export async function patientRegister(data: {
  name: string; email: string; password: string;
  age: number; height_cm: number; weight_kg: number; blood_group: string;
}): Promise<{ access_token: string; profile: PatientProfile }> {
  const res = await axios.post(`${BASE}/register`, data);
  return res.data;
}

export async function patientLogin(email: string, password: string): Promise<{ access_token: string; profile: PatientProfile }> {
  const res = await axios.post(`${BASE}/login`, { email, password });
  return res.data;
}

export function savePatientSession(token: string, profile: PatientProfile) {
  localStorage.setItem('bw_patient_token', token);
  localStorage.setItem('bw_patient_profile', JSON.stringify(profile));
}

export function getPatientToken(): string | null {
  return localStorage.getItem('bw_patient_token');
}

export function getPatientProfile(): PatientProfile | null {
  try {
    const raw = localStorage.getItem('bw_patient_profile');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearPatientSession() {
  localStorage.removeItem('bw_patient_token');
  localStorage.removeItem('bw_patient_profile');
  localStorage.removeItem('bw_patient_match_ids');
}

export function addPatientMatchId(id: string) {
  const raw = localStorage.getItem('bw_patient_match_ids');
  const ids: string[] = raw ? JSON.parse(raw) : [];
  if (!ids.includes(id)) ids.unshift(id);
  localStorage.setItem('bw_patient_match_ids', JSON.stringify(ids.slice(0, 20)));
}

export function getPatientMatchIds(): string[] {
  try {
    const raw = localStorage.getItem('bw_patient_match_ids');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function sendGratitude(donorHash: string, message: string): Promise<{ ok: boolean; donor_hash: string }> {
  const token = getPatientToken();
  const res = await axios.post(`${BASE}/gratitude`, { donor_hash: donorHash, message }, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.data;
}
