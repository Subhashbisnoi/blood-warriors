import client from './client';
import type { DashboardStats, BloodInventoryItem, InactiveDonor, ActiveBridge, AnalyticsData, ActivityEvent } from '../types';

export const getStats = () => client.get<DashboardStats>('/dashboard/stats').then(r => r.data);
export const getInventory = () => client.get<BloodInventoryItem[]>('/dashboard/inventory').then(r => r.data);
export const getInactiveDonors = (page = 1, limit = 20) =>
  client.get<{ items: InactiveDonor[]; total: number }>('/dashboard/inactive', { params: { page, limit } }).then(r => r.data);
export const getBridges = () => client.get<ActiveBridge[]>('/dashboard/bridges').then(r => r.data);
export const getAnalytics = () => client.get<AnalyticsData>('/dashboard/analytics').then(r => r.data);
export const getActivity = () => client.get<ActivityEvent[]>('/dashboard/activity').then(r => r.data);
