import client from './client';
import type { MatchRequest, MatchResponse } from '../types';

export const createMatch = (req: MatchRequest) =>
  client.post<MatchResponse>('/match', req).then(r => r.data);

export const getMatch = (matchId: string) =>
  client.get<MatchResponse>('/match/' + matchId).then(r => r.data);

export const listMatches = (status?: string, limit = 20) =>
  client.get('/match', { params: { status, limit } }).then(r => r.data);

export interface BulkParsedItem {
  blood_group: string;
  units: number;
  city: string;
  transfusion_date: string;
  lat: number;
  lon: number;
}

export interface BulkResultItem {
  blood_group: string;
  units: number;
  city: string;
  transfusion_date: string;
  match_id: string | null;
  candidates: MatchResponse['candidates'];
  total: number;
  status: 'matched' | 'no_donors';
}

export const bulkParse = (text: string): Promise<{ items: BulkParsedItem[] }> =>
  client.post('/match/bulk-parse', { text }).then(r => r.data);

export const bulkRun = (items: BulkParsedItem[]): Promise<{ results: BulkResultItem[] }> =>
  client.post('/match/bulk-run', { items }).then(r => r.data);
