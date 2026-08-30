export type ScreenId =
  | 'landing'
  | 'signin'
  | 'signup'
  | 'command-center'
  | 'repo-initiation'
  | 'architecture'
  | 'docs-generator'
  | 'interview-generator';

export interface RepositoryItem {
  id: string;
  name: string;
  type: 'github' | 'api' | 'quantum' | 'ai';
  lastScanned?: string;
  status: 'secure' | 'warning' | 'critical';
  healthScore: number;
}

export interface SecurityAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  timeAgo: string;
  detail: string;
  color: string;
}

export interface ThreatFeedItem {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'critical';
  date?: string;
}

export interface InterviewQuestion {
  id: string;
  number: number;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  question: string;
  answer: string;
}

export interface HotspotNode {
  id: string;
  label: string;
  x: number; // percentage on map 0-100
  y: number; // percentage on map 0-100
  status: 'high' | 'medium' | 'healthy';
  connectedTo?: string[];
}
