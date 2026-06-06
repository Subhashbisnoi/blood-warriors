import client from './client';
import type { OutreachSession } from '../types';

export const getOutreach = (matchId: string) =>
  client.get<OutreachSession>('/outreach/' + matchId).then(r => r.data);

export const reengageDonor = (userId: string) =>
  client.post('/outreach/' + userId + '/reengage').then(r => r.data);
