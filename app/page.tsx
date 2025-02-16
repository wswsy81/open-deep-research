'use client'

import { useState, useCallback, useRef } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Search,
  FileText,
  Download,
  Plus,
  X,
  ChevronDown,
  Brain,
  Code,
  Loader2,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type {
  SearchResult,
  RankingResult,
  PlatformModel,
  Status,
  State,
} from '@/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CONFIG } from '@/lib/config'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useKnowledgeBase } from '@/lib/hooks/use-knowledge-base'
import { useToast } from '@/hooks/use-toast'
import { KnowledgeBaseSidebar } from '@/components/knowledge-base-sidebar'

const timeFilters = [
  { value: 'all', label: 'Any time' },
  { value: '24h', label: 'Past 24 hours' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
  { value: 'year', label: 'Past year' },
] as const

const platformModels = Object.entries(CONFIG.platforms)
  .flatMap(([platform, config]) => {
    if (!config.enabled) return []

    return Object.entries(config.models).map(([modelId, modelConfig]) => {
      return {
        value: `${platform}__${modelId}`,
        label: `${platform.charAt(0).toUpperCase() + platform.slice(1)} - ${
          modelConfig.label
        }`,
        platform,
        disabled: !modelConfig.enabled,
      }
    })
  })
  .filter(Boolean) as (PlatformModel & { disabled: boolean })[]

const MAX_SELECTIONS = CONFIG.search.maxSelectableResults
const DEFAULT_MODEL = 'google__gemini-flash'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const retryWithBackoff = async <T,>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: any
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (error instanceof Error && error.message.includes('429')) {
        const delay = baseDelay * Math.pow(2, i)
        console.log(`Rate limited, retrying in ${delay}ms...`)
        await sleep(delay)
        continue
      }
      throw error
    }
  }
  throw lastError
}

export default function Home() {
  // Consolidated state management
  const [state, setState] = useState<State>({
    query: '',
    timeFilter: 'all',
    results: [],
    selectedResults: [],
    reportPrompt: '',
    report: null,
    error: null,
    newUrl: '',
    isSourcesOpen: false,
    selectedModel: DEFAULT_MODEL,
    isAgentMode: false,
    sidebarOpen: false,
    activeTab: 'search',
    status: {
      loading: false,
      generatingReport: false,
      agentStep: 'idle',
      fetchStatus: { total: 0, successful: 0, fallback: 0, sourceStatuses: {} },
      agentInsights: [],
      searchQueries: [],
    },
  })

  const { addReport } = useKnowledgeBase()
  const { toast } = useToast()

  // Add form ref
  const formRef = useRef<HTMLFormElement>(null)

  // Memoized state update functions
  const updateState = useCallback((updates: Partial<State>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }, [])

  const updateStatus = useCallback(
    (updates: Partial<Status> | ((prev: Status) => Status)) => {
      setState((prev) => {
        const newStatus =
          typeof updates === 'function'
            ? updates(prev.status)
            : { ...prev.status, ...updates }
        return { ...prev, status: newStatus }
      })
    },
    []
  )

  // Memoized error handler
  const handleError = useCallback(
    (error: unknown, context: string) => {
      const message = error instanceof Error ? error.message : 'Unknown error'
      updateState({ error: message })
      toast({ title: context, description: message, variant: 'destructive' })
    },
    [toast, updateState]
  )

  // Memoized content fetcher with proper type handling
  const fetchContent = useCallback(async (url: string) => {
    try {
      const response = await fetch('/api/fetch-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      if (!response.ok) throw new Error('Failed to fetch content')
      const data = await response.json()
      return data
    } catch (error) {
      if (error instanceof Error && error.message.includes('429')) throw error
      return { content: null }
    }
  }, [])

  // Memoized result selection handler
  const handleResultSelect = useCallback((resultId: string) => {
    setState((prev: State) => {
      if (prev.selectedResults.includes(resultId)) {
        return {
          ...prev,
          selectedResults: prev.selectedResults.filter((id) => id !== resultId),
          reportPrompt:
            prev.selectedResults.length <= 1 ? '' : prev.reportPrompt,
        }
      }
      if (prev.selectedResults.length >= MAX_SELECTIONS) return prev

      const newSelectedResults = [...prev.selectedResults, resultId]
      let newReportPrompt = prev.reportPrompt

      if (
        !prev.isAgentMode &&
        newSelectedResults.length === 1 &&
        !prev.reportPrompt
      ) {
        const result = prev.results.find((r) => r.id === resultId)
        if (result) {
          newReportPrompt = `Analyze and summarize the key points from ${result.name}`
        }
      }

      return {
        ...prev,
        selectedResults: newSelectedResults,
        reportPrompt: newReportPrompt,
      }
    })
  }, [])

  // Memoized search handler
  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!state.query.trim()) return

      const isGeneratingReport =
        state.selectedResults.length > 0 && !state.isAgentMode

      if (isGeneratingReport) {
        updateStatus({ generatingReport: true })
        updateState({ error: null })
        const initialFetchStatus: Status['fetchStatus'] = {
          total: state.selectedResults.length,
          successful: 0,
          fallback: 0,
          sourceStatuses: {},
        }
        updateStatus({ fetchStatus: initialFetchStatus })

        try {
          const contentResults = await Promise.all(
            state.results
              .filter((r) => state.selectedResults.includes(r.id))
              .map(async (article) => {
                try {
                  const { content } = await fetchContent(article.url)
                  if (content) {
                    updateStatus((prev: Status) => ({
                      ...prev,
                      fetchStatus: {
                        ...prev.fetchStatus,
                        successful: prev.fetchStatus.successful + 1,
                        sourceStatuses: {
                          ...prev.fetchStatus.sourceStatuses,
                          [article.url]: 'fetched' as const,
                        },
                      },
                    }))
                    return { url: article.url, title: article.name, content }
                  }
                } catch (error) {
                  if (error instanceof Error && error.message.includes('429'))
                    throw error
                }
                updateStatus((prev: Status) => ({
                  ...prev,
                  fetchStatus: {
                    ...prev.fetchStatus,
                    fallback: prev.fetchStatus.fallback + 1,
                    sourceStatuses: {
                      ...prev.fetchStatus.sourceStatuses,
                      [article.url]: 'preview' as const,
                    },
                  },
                }))
                return {
                  url: article.url,
                  title: article.name,
                  content: article.snippet,
                }
              })
          )

          const response = await retryWithBackoff(() =>
            fetch('/api/report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                selectedResults: contentResults.filter((r) =>
                  r.content?.trim()
                ),
                sources: state.results.filter((r) =>
                  state.selectedResults.includes(r.id)
                ),
                prompt: `${state.query}. Provide comprehensive analysis.`,
                platformModel: state.selectedModel,
              }),
            }).then((res) => res.json())
          )

          updateState({
            report: response,
            activeTab: 'report',
          })
        } catch (error) {
          handleError(error, 'Report Generation Failed')
        } finally {
          updateStatus({ generatingReport: false })
        }
        return
      }

      updateStatus({ loading: true })
      updateState({ error: null, reportPrompt: '' })

      try {
        const response = await retryWithBackoff(() =>
          fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: state.query,
              timeFilter: state.timeFilter,
            }),
          }).then((res) => res.json())
        )

        const newResults = (response.webPages?.value || []).map(
          (result: SearchResult) => ({
            ...result,
            id: `search-${Date.now()}-${result.id || result.url}`,
          })
        )

        setState((prev) => ({
          ...prev,
          results: [
            ...prev.results.filter(
              (r) => r.isCustomUrl || prev.selectedResults.includes(r.id)
            ),
            ...newResults.filter(
              (newResult: SearchResult) =>
                !prev.results.some((existing) => existing.url === newResult.url)
            ),
          ],
          error: null,
        }))
      } catch (error) {
        handleError(error, 'Search Error')
      } finally {
        updateStatus({ loading: false })
      }
    },
    [
      state.query,
      state.timeFilter,
      state.selectedResults,
      state.selectedModel,
      state.results,
      state.isAgentMode,
      fetchContent,
      handleError,
      updateStatus,
      updateState,
    ]
  )

  // Modify generateReport to use form submission
  const generateReport = useCallback(() => {
    if (!state.reportPrompt || state.selectedResults.length === 0) return

    // Update query with report prompt before submitting
    updateState({ query: state.reportPrompt })

    // Submit form programmatically
    if (formRef.current) {
      formRef.current.dispatchEvent(
        new Event('submit', { cancelable: true, bubbles: true })
      )
    }
  }, [state.reportPrompt, state.selectedResults.length, updateState])

  // Memoized agent search handler
  const handleAgentSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!state.reportPrompt.trim()) {
        toast({
          title: 'Missing Information',
          description: 'Please provide a research topic',
          variant: 'destructive',
        })
        return
      }

      updateStatus({
        agentStep: 'processing',
        agentInsights: [],
        searchQueries: [],
      })
      updateState({
        error: null,
        results: [],
        selectedResults: [],
        report: null,
      })

      try {
        // Step 1: Get optimized query and research prompt
        const { query, optimizedPrompt, explanation, suggestedStructure } =
          await retryWithBackoff(async () => {
            const response = await fetch('/api/optimize-research', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: state.reportPrompt }),
            })
            if (!response.ok) {
              throw new Error(
                `Failed to optimize research: ${response.status} ${response.statusText}`
              )
            }
            return response.json()
          })

        updateStatus((prev: Status) => ({
          ...prev,
          searchQueries: [query],
          agentInsights: [
            ...prev.agentInsights,
            `Research strategy: ${explanation}`,
            `Suggested structure: ${suggestedStructure.join(' → ')}`,
          ],
        }))

        // Step 2: Perform search with optimized query
        updateStatus({ agentStep: 'searching' })
        console.log('Performing search with optimized query:', query)
        const searchResponse = await retryWithBackoff(async () => {
          const response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              timeFilter: state.timeFilter,
              isTestQuery: query.toLowerCase() === 'test',
            }),
          })
          if (!response.ok) {
            const errorData = await response
              .json()
              .catch(() => ({ error: 'Could not parse error response' }))
            console.error('Search failed:', {
              status: response.status,
              query,
              error: errorData,
            })
            if (response.status === 429) {
              throw new Error('Rate limit exceeded')
            }
            if (response.status === 403) {
              throw new Error(
                'Search quota exceeded. Please try again later or contact support.'
              )
            }
            throw new Error('Search failed')
          }
          return response.json()
        })

        const searchResults = searchResponse.webPages?.value || []
        if (searchResults.length === 0) {
          throw new Error(
            'No search results found. Please try a different query.'
          )
        }

        // Process results
        const timestamp = Date.now()
        const allResults = searchResults.map(
          (result: SearchResult, idx: number) => ({
            ...result,
            id: `search-${timestamp}-${idx}-${result.url}`,
            score: 0,
          })
        )

        // Step 3: Analyze and rank results
        updateStatus({ agentStep: 'analyzing' })
        const { rankings, analysis } = await retryWithBackoff(async () => {
          const response = await fetch('/api/analyze-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: optimizedPrompt,
              results: allResults.map((r: SearchResult) => ({
                title: r.name,
                snippet: r.snippet,
                url: r.url,
              })),
              isTestQuery: query.toLowerCase() === 'test',
            }),
          })
          if (!response.ok) {
            throw new Error(
              `Failed to analyze results: ${response.status} ${response.statusText}`
            )
          }
          return response.json()
        })

        const rankedResults = allResults
          .map((result: SearchResult) => ({
            ...result,
            score:
              rankings.find((r: RankingResult) => r.url === result.url)
                ?.score || 0,
          }))
          .sort(
            (a: SearchResult, b: SearchResult) =>
              (b.score || 0) - (a.score || 0)
          )

        if (rankedResults.every((r: SearchResult) => r.score === 0)) {
          throw new Error(
            'No relevant results found. Please try a different query.'
          )
        }

        updateStatus((prev: Status) => ({
          ...prev,
          agentInsights: [
            ...prev.agentInsights,
            `Analysis: ${analysis}`,
            `Found ${rankedResults.length} relevant results`,
          ],
        }))

        // Select top results with diversity heuristic
        const selectedUrls = new Set<string>()
        const selected = rankedResults.filter((result: SearchResult) => {
          if (selectedUrls.size >= CONFIG.search.maxSelectableResults)
            return false
          const domain = new URL(result.url).hostname
          const hasSimilar = Array.from(selectedUrls).some(
            (url) => new URL(url).hostname === domain
          )
          if (!hasSimilar && result.score && result.score > 0.5) {
            selectedUrls.add(result.url)
            return true
          }
          return false
        })

        if (selected.length === 0) {
          throw new Error(
            'Could not find enough diverse, high-quality sources. Please try a different query.'
          )
        }

        updateState({
          results: rankedResults,
          selectedResults: selected.map((r: SearchResult) => r.id),
        })

        updateStatus((prev: Status) => ({
          ...prev,
          agentInsights: [
            ...prev.agentInsights,
            `Selected ${selected.length} diverse sources from ${
              new Set(
                selected.map((s: SearchResult) => new URL(s.url).hostname)
              ).size
            } unique domains`,
          ],
        }))

        // Step 4: Generate report
        updateStatus({ agentStep: 'generating' })
        const initialFetchStatus: Status['fetchStatus'] = {
          total: selected.length,
          successful: 0,
          fallback: 0,
          sourceStatuses: {},
        }
        updateStatus({ fetchStatus: initialFetchStatus })

        const contentResults = await Promise.all(
          selected.map(async (article: SearchResult) => {
            try {
              const { content } = await fetchContent(article.url)
              if (content) {
                updateStatus((prev: Status) => ({
                  ...prev,
                  fetchStatus: {
                    ...prev.fetchStatus,
                    successful: prev.fetchStatus.successful + 1,
                    sourceStatuses: {
                      ...prev.fetchStatus.sourceStatuses,
                      [article.url]: 'fetched' as const,
                    },
                  },
                }))
                return { url: article.url, title: article.name, content }
              }
            } catch (error) {
              if (error instanceof Error && error.message.includes('429'))
                throw error
            }
            updateStatus((prev: Status) => ({
              ...prev,
              fetchStatus: {
                ...prev.fetchStatus,
                fallback: prev.fetchStatus.fallback + 1,
                sourceStatuses: {
                  ...prev.fetchStatus.sourceStatuses,
                  [article.url]: 'preview' as const,
                },
              },
            }))
            return {
              url: article.url,
              title: article.name,
              content: article.snippet,
            }
          })
        )

        const reportResponse = await retryWithBackoff(() =>
          fetch('/api/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              selectedResults: contentResults.filter((r) => r.content?.trim()),
              sources: selected,
              prompt: `${optimizedPrompt}. Provide comprehensive analysis.`,
              platformModel: state.selectedModel,
            }),
          }).then((res) => res.json())
        )

        updateState({
          report: reportResponse,
          activeTab: 'report',
        })

        updateStatus((prev: Status) => ({
          ...prev,
          agentInsights: [
            ...prev.agentInsights,
            `Report generated successfully`,
          ],
          agentStep: 'idle',
        }))
      } catch (error) {
        handleError(error, 'Agent Error')
      }
    },
    [
      state.reportPrompt,
      state.timeFilter,
      generateReport,
      handleError,
      updateState,
      updateStatus,
    ]
  )

  // Memoized utility functions
  const handleAddCustomUrl = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!state.newUrl.trim()) return

      try {
        new URL(state.newUrl) // Validate URL format
        if (!state.results.some((r) => r.url === state.newUrl)) {
          const timestamp = Date.now()
          const newResult: SearchResult = {
            id: `custom-${timestamp}-${state.newUrl}`,
            url: state.newUrl,
            name: 'Custom URL',
            snippet: 'Custom URL added by user',
            isCustomUrl: true,
          }
          setState((prev: State) => ({
            ...prev,
            results: [newResult, ...prev.results],
            newUrl: '',
          }))
        }
      } catch {
        handleError('Please enter a valid URL', 'Invalid URL')
      }
    },
    [state.newUrl, state.results, handleError]
  )

  const handleRemoveResult = useCallback((resultId: string) => {
    setState((prev: State) => ({
      ...prev,
      results: prev.results.filter((r) => r.id !== resultId),
      selectedResults: prev.selectedResults.filter((id) => id !== resultId),
    }))
  }, [])

  const handleDownload = useCallback(
    async (format: 'pdf' | 'docx' | 'txt') => {
      if (!state.report) return

      try {
        const response = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report: state.report,
            format,
          }),
        })

        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `report.${format}`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } catch (error) {
        handleError(error, 'Download failed')
      }
    },
    [state.report, handleError]
  )

  const handleSaveToKnowledgeBase = useCallback(() => {
    if (!state.report) return
    const success = addReport(state.report, state.reportPrompt)
    if (success) {
      toast({
        title: 'Saved to Knowledge Base',
        description: 'The report has been saved for future reference',
      })
    }
  }, [state.report, state.reportPrompt, addReport, toast])

  return (
    <div className='min-h-screen bg-white p-4 sm:p-8'>
      <KnowledgeBaseSidebar
        open={state.sidebarOpen}
        onOpenChange={(open) => updateState({ sidebarOpen: open })}
      />
      <main className='max-w-4xl mx-auto space-y-8'>
        <div className='mb-3'>
          <h1 className='mb-2 text-center text-gray-800 flex items-center justify-center gap-2'>
            <img
              src='/apple-icon.png'
              alt='Open Deep Research'
              className='w-6 h-6 sm:w-8 sm:h-8 rounded-full'
            />
            <span className='text-xl sm:text-3xl font-bold font-heading'>
              Open Deep Research
            </span>
          </h1>
          <div className='text-center space-y-3 mb-8'>
            <p className='text-gray-600'>
              Open source alternative to Gemini Deep Research. Generate reports
              with AI based on search results.
            </p>
            <div className='flex flex-wrap justify-center items-center gap-2'>
              <Button
                variant='default'
                size='sm'
                onClick={() => updateState({ sidebarOpen: true })}
                className='inline-flex items-center gap-1 sm:gap-2 text-xs sm:text-sm rounded-full'
              >
                <Brain className='h-4 w-4' />
                View Knowledge Base
              </Button>
              <Button
                asChild
                variant='outline'
                size='sm'
                className='inline-flex items-center gap-1 sm:gap-2 text-xs sm:text-sm rounded-full'
              >
                <a
                  href='https://github.com/btahir/open-deep-research'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <Code className='h-4 w-4' />
                  View Code
                </a>
              </Button>
            </div>
            <div className='flex justify-center items-center'>
              <div className='flex items-center space-x-2'>
                <Checkbox
                  id='agent-mode'
                  checked={state.isAgentMode}
                  className='w-4 h-4'
                  onCheckedChange={(checked) =>
                    updateState({ isAgentMode: checked as boolean })
                  }
                />
                <label
                  htmlFor='agent-mode'
                  className='text-xs sm:text-sm font-medium leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
                >
                  Agent Mode (Automatic search and report generation)
                </label>
              </div>
            </div>
          </div>
          {state.status.agentStep !== 'idle' && (
            <div className='mb-4 p-4 bg-blue-50 rounded-lg'>
              <div className='flex items-center gap-3 mb-3'>
                <Loader2 className='h-5 w-5 text-blue-600 animate-spin' />
                <h3 className='font-semibold text-blue-800'>Agent Progress</h3>
              </div>

              <div className='space-y-2'>
                <div className='flex items-center gap-2 text-sm'>
                  <span className='font-medium'>Current Step:</span>
                  <span className='capitalize'>{state.status.agentStep}</span>
                </div>

                {state.status.agentInsights.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className='text-sm text-blue-600 hover:underline flex items-center gap-1'>
                      Show Research Details <ChevronDown className='h-4 w-4' />
                    </CollapsibleTrigger>
                    <CollapsibleContent className='mt-2 space-y-2 text-sm text-gray-600'>
                      {state.status.agentInsights.map((insight, idx) => (
                        <div key={idx} className='flex gap-2'>
                          <span className='text-gray-400'>•</span>
                          {insight}
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </div>
          )}
          <form
            ref={formRef}
            onSubmit={state.isAgentMode ? handleAgentSearch : handleSearch}
            className='space-y-4'
          >
            {!state.isAgentMode ? (
              <>
                <div className='flex flex-col sm:flex-row gap-2'>
                  <div className='relative flex-1'>
                    <Input
                      type='text'
                      value={state.query}
                      onChange={(e) => updateState({ query: e.target.value })}
                      placeholder='Enter your search query...'
                      className='pr-8'
                    />
                    <Search className='absolute right-2 top-2 h-5 w-5 text-gray-400' />
                  </div>

                  <div className='flex flex-col sm:flex-row gap-2 sm:items-center'>
                    <Select
                      value={state.timeFilter}
                      onValueChange={(value) =>
                        updateState({ timeFilter: value })
                      }
                    >
                      <SelectTrigger className='w-full sm:w-[140px]'>
                        <SelectValue placeholder='Select time range' />
                      </SelectTrigger>
                      <SelectContent>
                        {timeFilters.map((filter) => (
                          <SelectItem key={filter.value} value={filter.value}>
                            {filter.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={state.selectedModel}
                      onValueChange={(value) =>
                        updateState({ selectedModel: value })
                      }
                      disabled={platformModels.length === 0}
                    >
                      <SelectTrigger className='w-full sm:w-[200px]'>
                        <SelectValue
                          placeholder={
                            platformModels.length === 0
                              ? 'No models available'
                              : 'Select model'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {platformModels.map((model) => (
                          <SelectItem
                            key={model.value}
                            value={model.value}
                            disabled={model.disabled}
                            className={
                              model.disabled
                                ? 'text-gray-400 cursor-not-allowed'
                                : ''
                            }
                          >
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      type='submit'
                      disabled={state.status.loading}
                      className='w-full sm:w-auto'
                    >
                      {state.status.loading ? 'Searching...' : 'Search'}
                    </Button>
                  </div>
                </div>
                <div className='flex gap-2'>
                  <Input
                    type='url'
                    value={state.newUrl}
                    onChange={(e) => updateState({ newUrl: e.target.value })}
                    placeholder='Add custom URL...'
                    className='flex-1'
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddCustomUrl(e)
                      }
                    }}
                  />
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    onClick={handleAddCustomUrl}
                  >
                    <Plus className='h-4 w-4' />
                  </Button>
                </div>
              </>
            ) : (
              <div className='space-y-4 sm:space-y-6 lg:space-y-0'>
                <div className='flex flex-col sm:flex-row lg:items-center gap-2'>
                  <div className='relative flex-1'>
                    <Input
                      value={state.reportPrompt}
                      onChange={(e) =>
                        updateState({ reportPrompt: e.target.value })
                      }
                      placeholder="What would you like to research? (e.g., 'Tesla Q4 2024 financial performance and market impact')"
                      className='pr-8 text-lg'
                    />
                    <Brain className='absolute right-4 top-3 h-5 w-5 text-gray-400' />
                  </div>
                  <div className='flex flex-col sm:flex-row lg:flex-nowrap gap-2 sm:items-center'>
                    <div className='w-full sm:w-[200px]'>
                      <Select
                        value={state.selectedModel}
                        onValueChange={(value) =>
                          updateState({ selectedModel: value })
                        }
                        disabled={platformModels.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              platformModels.length === 0
                                ? 'No models available'
                                : 'Select model'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {platformModels.map((model) => (
                            <SelectItem
                              key={model.value}
                              value={model.value}
                              disabled={model.disabled}
                              className={
                                model.disabled
                                  ? 'text-gray-400 cursor-not-allowed'
                                  : ''
                              }
                            >
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type='submit'
                      disabled={state.status.agentStep !== 'idle'}
                      className='w-full sm:w-auto lg:w-[200px] bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap'
                    >
                      {state.status.agentStep !== 'idle' ? (
                        <span className='flex items-center gap-2'>
                          <Loader2 className='h-4 w-4 animate-spin' />
                          {
                            {
                              processing: 'Planning Research...',
                              searching: 'Searching Web...',
                              analyzing: 'Analyzing Results...',
                              generating: 'Writing Report...',
                            }[state.status.agentStep]
                          }
                        </span>
                      ) : (
                        'Start Deep Research'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        <Separator className='my-8' />

        {state.error && (
          <div className='p-4 mb-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-center'>
            {state.error}
          </div>
        )}

        {state.results.length > 0 && (
          <Tabs
            value={state.activeTab}
            onValueChange={(value) => updateState({ activeTab: value })}
            className='w-full'
          >
            <div className='mb-6 space-y-4'>
              {state.selectedResults.length > 0 && !state.isAgentMode && (
                <div className='flex flex-col sm:flex-row gap-2'>
                  <div className='relative flex-1'>
                    <Input
                      value={state.reportPrompt}
                      onChange={(e) =>
                        updateState({ reportPrompt: e.target.value })
                      }
                      placeholder="What would you like to know about these sources? (e.g., 'Compare and analyze the key points')"
                      className='pr-8'
                    />
                    <FileText className='absolute right-2 top-2.5 h-5 w-5 text-gray-400' />
                  </div>
                  <Button
                    onClick={generateReport}
                    disabled={
                      !state.reportPrompt.trim() ||
                      state.status.generatingReport ||
                      !state.selectedModel
                    }
                    type='button'
                    className='w-full sm:w-auto whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white'
                  >
                    {state.status.generatingReport ? (
                      <span className='flex items-center gap-2'>
                        <Loader2 className='h-4 w-4 animate-spin' />
                        Generating...
                      </span>
                    ) : (
                      'Generate Report'
                    )}
                  </Button>
                </div>
              )}
              <div className='text-sm text-gray-600 text-center sm:text-left space-y-1'>
                <p>
                  {state.selectedResults.length === 0
                    ? 'Select up to 3 results to generate a report'
                    : state.selectedModel
                    ? `${state.selectedResults.length} of ${MAX_SELECTIONS} results selected`
                    : 'Please select a model above to generate a report'}
                </p>
                {state.status.generatingReport && (
                  <p>
                    {state.status.fetchStatus.successful} fetched,{' '}
                    {state.status.fetchStatus.fallback} failed (of{' '}
                    {state.status.fetchStatus.total})
                  </p>
                )}
              </div>
              <TabsList className='grid w-full grid-cols-2 mb-4'>
                <TabsTrigger value='search'>Search Results</TabsTrigger>
                <TabsTrigger value='report' disabled={!state.report}>
                  Report
                </TabsTrigger>
              </TabsList>

              <TabsContent value='search' className='space-y-4'>
                {!state.isAgentMode &&
                  state.results
                    .filter((r) => r.isCustomUrl)
                    .map((result) => (
                      <Card
                        key={result.id}
                        className='overflow-hidden border-2 border-blue-100'
                      >
                        <CardContent className='p-4 flex gap-4'>
                          <div className='pt-1'>
                            <Checkbox
                              checked={state.selectedResults.includes(
                                result.id
                              )}
                              onCheckedChange={() =>
                                handleResultSelect(result.id)
                              }
                              disabled={
                                !state.selectedResults.includes(result.id) &&
                                state.selectedResults.length >= MAX_SELECTIONS
                              }
                            />
                          </div>
                          <div className='flex-1 min-w-0'>
                            <div className='flex justify-between items-start'>
                              <a
                                href={result.url}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='text-blue-600 hover:underline'
                              >
                                <h2 className='text-xl font-semibold truncate'>
                                  {result.name}
                                </h2>
                              </a>
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => handleRemoveResult(result.id)}
                                className='ml-2'
                              >
                                <X className='h-4 w-4' />
                              </Button>
                            </div>
                            <p className='text-green-700 text-sm truncate'>
                              {result.url}
                            </p>
                            <p className='mt-1 text-gray-600 line-clamp-2'>
                              {result.snippet}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}

                {state.results
                  .filter((r) => !r.isCustomUrl)
                  .map((result) => (
                    <Card key={result.id} className='overflow-hidden'>
                      <CardContent className='p-4 flex gap-4'>
                        <div className='pt-1'>
                          <Checkbox
                            checked={state.selectedResults.includes(result.id)}
                            onCheckedChange={() =>
                              handleResultSelect(result.id)
                            }
                            disabled={
                              !state.selectedResults.includes(result.id) &&
                              state.selectedResults.length >= MAX_SELECTIONS
                            }
                          />
                        </div>
                        <div className='flex-1 min-w-0'>
                          <h2 className='text-xl font-semibold truncate text-blue-600 hover:underline'>
                            <a
                              href={result.url}
                              target='_blank'
                              rel='noopener noreferrer'
                              dangerouslySetInnerHTML={{ __html: result.name }}
                            />
                          </h2>
                          <p className='text-green-700 text-sm truncate'>
                            {result.url}
                          </p>
                          <p
                            className='mt-1 text-gray-600 line-clamp-2'
                            dangerouslySetInnerHTML={{ __html: result.snippet }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </TabsContent>

              <TabsContent value='report'>
                {state.report && (
                  <Card>
                    <CardContent className='p-6 space-y-6'>
                      <Collapsible
                        open={state.isSourcesOpen}
                        onOpenChange={(open) =>
                          updateState({ isSourcesOpen: open })
                        }
                        className='w-full border rounded-lg p-2'
                      >
                        <CollapsibleTrigger className='flex items-center justify-between w-full'>
                          <span className='text-sm font-medium'>Overview</span>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              state.isSourcesOpen ? 'transform rotate-180' : ''
                            }`}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className='space-y-4 mt-2'>
                          <div className='text-sm text-gray-600 bg-gray-50 p-3 rounded'>
                            <p className='font-medium text-gray-700'>
                              {state.status.fetchStatus.successful} of{' '}
                              {state.report?.sources?.length || 0} sources
                              fetched successfully
                            </p>
                          </div>
                          <div className='space-y-2'>
                            {state.report?.sources?.map((source) => (
                              <div key={source.id} className='text-gray-600'>
                                <div className='flex items-center gap-2'>
                                  <a
                                    href={source.url}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='text-blue-600 hover:underline'
                                  >
                                    {source.name}
                                  </a>
                                  <span
                                    className={`text-xs px-1.5 py-0.5 rounded ${
                                      state.status.fetchStatus.sourceStatuses[
                                        source.url
                                      ] === 'fetched'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-yellow-50 text-yellow-600'
                                    }`}
                                  >
                                    {state.status.fetchStatus.sourceStatuses[
                                      source.url
                                    ] === 'fetched'
                                      ? 'fetched'
                                      : 'preview'}
                                  </span>
                                </div>
                                <p className='text-sm text-gray-500'>
                                  {source.url}
                                </p>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                      <div className='flex flex-col-reverse sm:flex-row sm:justify-between sm:items-start gap-4'>
                        <h2 className='text-2xl font-bold text-gray-800 text-center sm:text-left'>
                          {state.report?.title}
                        </h2>
                        <div className='flex w-full sm:w-auto gap-2'>
                          <Button
                            variant='outline'
                            size='sm'
                            className='gap-2'
                            onClick={handleSaveToKnowledgeBase}
                          >
                            <Brain className='h-4 w-4' />
                            Save to Knowledge Base
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant='outline'
                                size='sm'
                                className='gap-2'
                              >
                                <Download className='h-4 w-4' />
                                Download
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end'>
                              <DropdownMenuItem
                                onClick={() => handleDownload('pdf')}
                              >
                                Download as PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDownload('docx')}
                              >
                                Download as Word
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDownload('txt')}
                              >
                                Download as Text
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <p className='text-lg text-gray-700'>
                        {state.report?.summary}
                      </p>
                      {state.report?.sections?.map((section, index) => (
                        <div key={index} className='space-y-2 border-t pt-4'>
                          <h3 className='text-xl font-semibold text-gray-700'>
                            {section.title}
                          </h3>
                          <div className='prose max-w-none text-gray-600'>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {section.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}
      </main>
    </div>
  )
}
