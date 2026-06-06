import client from './client';
import type { DonorProfile } from '../types';

export const listDonors = (page = 1, limit = 20) =>
  client.get('/donors', { params: { page, limit } }).then(r => r.data);

export const getDonor = (userId: string) =>
  client.get<DonorProfile>('/donors/' + userId).then(r => r.data);

export const getDonorBridges = (userId: string) =>
  client.get('/donors/' + userId + '/bridges').then(r => r.data);
