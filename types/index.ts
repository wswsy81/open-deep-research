export type Report = {
  title: string
  summary: string
  sections: {
    title: string
    content: string
  }[]
  sources: {
    id: string
    url: string
    name: string
  }[]
}
export interface Article {
  url: string
  title: string
  content: string
}

export type KnowledgeBaseReport = {
  id: string
  timestamp: number
  query: string
  report: Report
}

export type SearchResult = {
  id: string
  url: string
  name: string
  snippet: string
  isCustomUrl?: boolean
  score?: number
}

export type RankingResult = {
  url: string
  score: number
  reasoning: string
}

export type PlatformModel = {
  value: string
  label: string
  platform: string
  disabled: boolean
}

export type Status = {
  loading: boolean
  generatingReport: boolean
  agentStep: 'idle' | 'processing' | 'searching' | 'analyzing' | 'generating'
  fetchStatus: {
    total: number
    successful: number
    fallback: number
    sourceStatuses: Record<string, 'fetched' | 'preview'>
  }
  agentInsights: string[]
  searchQueries: string[]
}

export type State = {
  query: string
  timeFilter: string
  results: SearchResult[]
  selectedResults: string[]
  reportPrompt: string
  report: Report | null
  error: string | null
  newUrl: string
  isSourcesOpen: boolean
  selectedModel: string
  isAgentMode: boolean
  sidebarOpen: boolean
  activeTab: string
  status: Status
}
