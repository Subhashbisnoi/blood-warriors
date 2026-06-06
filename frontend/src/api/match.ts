import client from './client';
import type { MatchRequest, MatchResponse } from '../types';

export const createMatch = (req: MatchRequest) =>
  client.post<MatchResponse>('/match', req).then(r => r.data);

export const getMatch = (matchId: string) =>
  client.get<MatchResponse>('/match/' + matchId).then(r => r.data);

export const listMatches = (status?: string, limit = 20) =>
  client.get('/match', { params: { status, limit } }).then(r => r.data);
