import client from './client';
import type { ChatMessage } from '../types';

export const sendMessage = (userId: string, message: string, flow = 'outreach', sessionId?: string) =>
  client.post('/chat', { user_id: userId, message, flow, session_id: sessionId }).then(r => r.data);

export const getChatHistory = (userId: string) =>
  client.get<ChatMessage[]>('/chat/' + userId + '/history').then(r => r.data);
