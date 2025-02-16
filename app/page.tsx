'use client'

import { useState, useEffect } from 'react'
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
import type { Report } from '@/types'
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

type SearchResult = {
  id: string
  url: string
  name: string
  snippet: string
  isCustomUrl?: boolean
  score?: number
}

type RankingResult = {
  url: string
  score: number
  reasoning: string
}

type PlatformModel = {
  value: string
  label: string
  platform: string
  disabled: boolean
}

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
  const [query, setQuery] = useState('')
  const [timeFilter, setTimeFilter] = useState('all')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedResults, setSelectedResults] = useState<string[]>([])
  const [reportPrompt, setReportPrompt] = useState('')
  const [generatingReport, setGeneratingReport] = useState(false)
  const [activeTab, setActiveTab] = useState('search')
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetchStatus, setFetchStatus] = useState<{
    total: number
    successful: number
    fallback: number
    sourceStatuses: Record<string, 'fetched' | 'preview'>
  }>({ total: 0, successful: 0, fallback: 0, sourceStatuses: {} })
  const [newUrl, setNewUrl] = useState('')
  const [isSourcesOpen, setIsSourcesOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>(
    'google__gemini-flash'
  )
  const [isAgentMode, setIsAgentMode] = useState(false)
  const [agentStep, setAgentStep] = useState<
    'idle' | 'processing' | 'searching' | 'analyzing' | 'generating'
  >('idle')
  const [searchQueries, setSearchQueries] = useState<string[]>([])
  const [agentInsights, setAgentInsights] = useState<string[]>([])
  const { addReport } = useKnowledgeBase()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { toast } = useToast()

  // Add effect to auto-generate report when results are selected
  useEffect(() => {
    if (
      !isAgentMode &&
      selectedResults.length > 0 &&
      reportPrompt.trim() &&
      !generatingReport
    ) {
      // Removed auto-generation
    }
  }, [selectedResults, isAgentMode])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setReportPrompt('')
    try {
      const response = await retryWithBackoff(async () => {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, timeFilter }),
        })

        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || 'Search failed. Please try again.')
        }

        return res.json()
      })

      // Clear any previous errors if the search was successful
      setError(null)

      // Create a Set to track unique IDs
      const seenIds = new Set<string>()
      const uniqueResults: SearchResult[] = []

      // First add selected items
      results
        .filter((r) => selectedResults.includes(r.id))
        .forEach((item) => {
          if (!seenIds.has(item.id)) {
            uniqueResults.push(item)
            seenIds.add(item.id)
          }
        })

      // Then add custom URLs
      results
        .filter((r) => r.isCustomUrl)
        .forEach((item) => {
          if (!seenIds.has(item.id)) {
            uniqueResults.push(item)
            seenIds.add(item.id)
          }
        })

      // Finally add new search results
      const timestamp = Date.now()
      const newResults = (response.webPages?.value || [])
        .map((result: SearchResult) => ({
          ...result,
          id: `search-${timestamp}-${result.id || result.url}`,
        }))
        .filter(
          (newResult: SearchResult) =>
            !uniqueResults.some((existing) => existing.url === newResult.url)
        )

      setResults([...uniqueResults, ...newResults])
    } catch (error) {
      console.error('Search failed:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Search failed'
      setError(errorMessage)
      toast({
        title: 'Search Error',
        description: errorMessage,
        variant: 'destructive',
      })
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  // Add handler for result selection that includes prompt
  const handleResultSelect = (resultId: string) => {
    setSelectedResults((prev) => {
      if (prev.includes(resultId)) {
        return prev.filter((id) => id !== resultId)
      }
      if (prev.length >= MAX_SELECTIONS) {
        return prev
      }

      // If this is the first selection in regular mode, suggest a title
      if (!isAgentMode && prev.length === 0 && !reportPrompt) {
        const result = results.find((r) => r.id === resultId)
        if (result) {
          const suggestedPrompt = `Analyze and summarize information about ${result.name}`
          setReportPrompt(suggestedPrompt)
        }
      }

      return [...prev, resultId]
    })
  }

  const handleAddCustomUrl = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUrl.trim()) return

    try {
      new URL(newUrl) // Validate URL format
      if (!results.some((r) => r.url === newUrl)) {
        const timestamp = Date.now()
        const newResult: SearchResult = {
          id: `custom-${timestamp}-${newUrl}`,
          url: newUrl,
          name: 'Custom URL',
          snippet: 'Custom URL added by user',
          isCustomUrl: true,
        }
        setResults((prev) => [newResult, ...prev])
      }
      setNewUrl('')
    } catch {
      const errorMessage = 'Please enter a valid URL'
      setError(errorMessage)
      toast({
        title: 'Invalid URL',
        description: errorMessage,
        variant: 'destructive',
      })
    }
  }

  const handleRemoveResult = (resultId: string) => {
    setResults((prev) => prev.filter((r) => r.id !== resultId))
    setSelectedResults((prev) => prev.filter((id) => id !== resultId))
  }

  const handleGenerateReport = async () => {
    if (!reportPrompt || selectedResults.length === 0) return

    setGeneratingReport(true)
    setError(null)
    setFetchStatus({
      total: selectedResults.length,
      successful: 0,
      fallback: 0,
      sourceStatuses: {},
    })

    try {
      const selectedArticles = results.filter((r) =>
        selectedResults.includes(r.id)
      )

      // Fetch content for each URL
      const contentResults = []
      let hitRateLimit = false

      for (const article of selectedArticles) {
        try {
          const response = await fetch('/api/fetch-content', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: article.url }),
          })

          if (response.ok) {
            const { content } = await response.json()
            contentResults.push({
              url: article.url,
              title: article.name,
              content: content,
            })
            setFetchStatus((prev) => ({
              ...prev,
              successful: prev.successful + 1,
              sourceStatuses: {
                ...prev.sourceStatuses,
                [article.url]: 'fetched',
              },
            }))
          } else if (response.status === 429) {
            hitRateLimit = true
            throw new Error(
              'Rate limit exceeded. Please wait a moment before generating another report.'
            )
          } else {
            console.warn(
              `Failed to fetch content for ${article.url}, using snippet`
            )
            contentResults.push({
              url: article.url,
              title: article.name,
              content: article.snippet,
            })
            setFetchStatus((prev) => ({
              ...prev,
              fallback: prev.fallback + 1,
              sourceStatuses: {
                ...prev.sourceStatuses,
                [article.url]: 'preview',
              },
            }))
          }
        } catch (error) {
          if (hitRateLimit) throw error
          console.warn(`Error fetching ${article.url}, using snippet:`, error)
          contentResults.push({
            url: article.url,
            title: article.name,
            content: article.snippet,
          })
          setFetchStatus((prev) => ({
            ...prev,
            fallback: prev.fallback + 1,
          }))
        }
      }

      // Only proceed with successful fetches
      const successfulResults = contentResults.filter(
        (result) => result.content && result.content.trim().length > 0
      )

      if (successfulResults.length === 0) {
        throw new Error(
          'Failed to fetch usable content for any of the selected articles'
        )
      }

      // Update the report generation API call
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedResults: successfulResults,
          sources: results
            .filter((r) => selectedResults.includes(r.id))
            .map((r) => ({
              id: r.id,
              url: r.url,
              name: r.name,
            })),
          prompt: `${reportPrompt}. Provide a comprehensive analysis that synthesizes all relevant information from the provided sources.`,
          platformModel: selectedModel,
        }),
      })

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(
            'Rate limit exceeded. Please wait a moment before generating another report.'
          )
        }
        throw new Error('Failed to generate report. Please try again.')
      }

      const data = await response.json()
      console.log('Report data:', data)
      setReport(data)
      setActiveTab('report')
    } catch (error) {
      console.error('Report generation failed:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Report generation failed'
      setError(errorMessage)
      toast({
        title: 'Report Generation Failed',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setGeneratingReport(false)
    }
  }

  const handleDownload = async (format: 'pdf' | 'docx' | 'txt') => {
    if (!report) return

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          report,
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
      console.error('Download failed:', error)
    }
  }

  const handleSaveToKnowledgeBase = () => {
    if (!report) return
    const success = addReport(report, reportPrompt)
    if (success) {
      toast({
        title: 'Saved to Knowledge Base',
        description: 'The report has been saved for future reference',
      })
    }
  }

  const handleAgentSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportPrompt.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please provide a research topic',
        variant: 'destructive',
      })
      return
    }

    try {
      setAgentStep('processing')
      setError(null)
      setResults([])
      setSelectedResults([])
      setReport(null)
      setAgentInsights([])

      // Step 1: Get optimized query and research prompt
      const { query, optimizedPrompt, explanation, suggestedStructure } =
        await retryWithBackoff(async () => {
          const response = await fetch('/api/optimize-research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: reportPrompt }),
          })
          if (!response.ok) {
            throw new Error(
              `Failed to optimize research: ${response.status} ${response.statusText}`
            )
          }
          return response.json()
        })

      setSearchQueries([query])
      setAgentInsights((prev) => [
        ...prev,
        `Research strategy: ${explanation}`,
        `Suggested structure: ${suggestedStructure.join(' → ')}`,
      ])

      // Step 2: Perform search with optimized query
      setAgentStep('searching')
      console.log('Performing search with optimized query:', query)
      const searchResponse = await retryWithBackoff(async () => {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            timeFilter,
            isTestQuery: query.toLowerCase() === 'test', // Add flag to indicate test query
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
      const allResults = searchResults.map((result: any, idx: number) => ({
        ...result,
        id: `search-${timestamp}-${idx}-${result.url}`,
        score: 0,
      }))

      // Step 3: Analyze and rank results
      setAgentStep('analyzing')
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
            rankings.find((r: RankingResult) => r.url === result.url)?.score ||
            0,
        }))
        .sort(
          (a: SearchResult, b: SearchResult) => (b.score || 0) - (a.score || 0)
        )

      if (rankedResults.every((r: SearchResult) => r.score === 0)) {
        throw new Error(
          'No relevant results found. Please try a different query.'
        )
      }

      setAgentInsights((prev) => [
        ...prev,
        `Analysis: ${analysis}`,
        `Found ${rankedResults.length} relevant results`,
      ])

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

      setResults(rankedResults)
      setSelectedResults(selected.map((r: SearchResult) => r.id))
      setAgentInsights((prev) => [
        ...prev,
        `Selected ${selected.length} diverse sources from ${
          new Set(selected.map((s: SearchResult) => new URL(s.url).hostname))
            .size
        } unique domains`,
      ])

      // Update the report prompt with the optimized version
      setReportPrompt(optimizedPrompt)

      // Step 4: Generate report with optimized prompt
      setAgentStep('generating')
      await retryWithBackoff(async () => handleGenerateReport())

      setAgentInsights((prev) => [...prev, `Report generated successfully`])
    } catch (error) {
      console.error('Agent process failed:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Research failed'
      setError(errorMessage)
      toast({
        title: 'Agent Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setAgentStep('idle')
    }
  }

  return (
    <div className='min-h-screen bg-white p-4 sm:p-8'>
      <KnowledgeBaseSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
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
                onClick={() => setSidebarOpen(true)}
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
                  checked={isAgentMode}
                  className='w-4 h-4'
                  onCheckedChange={(checked) =>
                    setIsAgentMode(checked as boolean)
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
          {agentStep !== 'idle' && (
            <div className='mb-4 p-4 bg-blue-50 rounded-lg'>
              <div className='flex items-center gap-3 mb-3'>
                <Loader2 className='h-5 w-5 text-blue-600 animate-spin' />
                <h3 className='font-semibold text-blue-800'>Agent Progress</h3>
              </div>

              <div className='space-y-2'>
                <div className='flex items-center gap-2 text-sm'>
                  <span className='font-medium'>Current Step:</span>
                  <span className='capitalize'>{agentStep}</span>
                </div>

                {agentInsights.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className='text-sm text-blue-600 hover:underline flex items-center gap-1'>
                      Show Research Details <ChevronDown className='h-4 w-4' />
                    </CollapsibleTrigger>
                    <CollapsibleContent className='mt-2 space-y-2 text-sm text-gray-600'>
                      {agentInsights.map((insight, idx) => (
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
            onSubmit={isAgentMode ? handleAgentSearch : handleSearch}
            className='space-y-4'
          >
            {!isAgentMode ? (
              <>
                <div className='flex flex-col sm:flex-row gap-2'>
                  <div className='relative flex-1'>
                    <Input
                      type='text'
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder='Enter your search query...'
                      className='pr-8'
                    />
                    <Search className='absolute right-2 top-2 h-5 w-5 text-gray-400' />
                  </div>

                  <div className='flex flex-col sm:flex-row gap-2 sm:items-center'>
                    <Select value={timeFilter} onValueChange={setTimeFilter}>
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

                    <Button
                      type='submit'
                      disabled={loading}
                      className='w-full sm:w-auto'
                    >
                      {loading ? 'Searching...' : 'Search'}
                    </Button>
                  </div>
                </div>
                <div className='flex gap-2'>
                  <Input
                    type='url'
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder='Add custom URL...'
                    className='flex-1'
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomUrl(e);
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
              <div className='space-y-4 sm:space-y-6'>
                <div className='relative flex-1'>
                  <Input
                    value={reportPrompt}
                    onChange={(e) => setReportPrompt(e.target.value)}
                    placeholder="What would you like to research? (e.g., 'Tesla Q4 2024 financial performance and market impact')"
                    className='pr-8 text-lg py-6'
                  />
                  <Brain className='absolute right-4 top-4 h-5 w-5 text-gray-400' />
                </div>
                <div className='w-full'>
                  <Button
                    type='submit'
                    disabled={agentStep !== 'idle'}
                    className='w-full bg-blue-600 hover:bg-blue-700 text-white'
                  >
                    {agentStep !== 'idle' ? (
                      <span className='flex items-center gap-2'>
                        <Loader2 className='h-4 w-4 animate-spin' />
                        {
                          {
                            processing: 'Planning Research...',
                            searching: 'Searching Web...',
                            analyzing: 'Analyzing Results...',
                            generating: 'Writing Report...',
                          }[agentStep]
                        }
                      </span>
                    ) : (
                      'Start Deep Research'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </div>

        <Separator className='my-8' />

        {!isAgentMode && (
          <div className='mb-6'>
            {/* Remove this section since we moved it above */}
          </div>
        )}

        {error && (
          <div className='p-4 mb-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-center'>
            {error}
          </div>
        )}

        {results.length > 0 && (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className='w-full'
          >
            <div className='mb-6 space-y-4'>
              {selectedResults.length > 0 && (
                <div className='flex flex-col sm:flex-row gap-2'>
                  {!isAgentMode && (
                    <div className='relative flex-1'>
                      <Input
                        value={reportPrompt}
                        onChange={(e) => setReportPrompt(e.target.value)}
                        placeholder="What would you like to know about these sources? (e.g., 'Compare and analyze the key points')"
                        className='pr-8'
                      />
                      <FileText className='absolute right-2 top-2.5 h-5 w-5 text-gray-400' />
                    </div>
                  )}
                  <div className={`flex flex-col sm:flex-row gap-2 ${isAgentMode ? 'w-full' : ''}`}>
                    <Select
                      value={selectedModel}
                      onValueChange={setSelectedModel}
                      disabled={platformModels.length === 0}
                    >
                      <SelectTrigger className={`w-full ${!isAgentMode ? 'sm:w-[200px]' : ''}`}>
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
                      onClick={handleGenerateReport}
                      disabled={!reportPrompt.trim() || generatingReport}
                      className={`w-full ${!isAgentMode ? 'sm:w-auto whitespace-nowrap' : ''}`}
                    >
                      {generatingReport ? (
                        <span className='flex items-center gap-2'>
                          <Loader2 className='h-4 w-4 animate-spin' />
                          Generating...
                        </span>
                      ) : (
                        'Generate Report'
                      )}
                    </Button>
                  </div>
                </div>
              )}
              <div className='text-sm text-gray-600 text-center sm:text-left space-y-1'>
                <p>
                  {selectedResults.length === 0
                    ? 'Select up to 3 results to generate a report'
                    : `${selectedResults.length} of ${MAX_SELECTIONS} results selected`}
                </p>
                {generatingReport && (
                  <p>
                    {fetchStatus.successful} fetched, {fetchStatus.fallback}{' '}
                    failed (of {fetchStatus.total})
                  </p>
                )}
              </div>
              <TabsList className='grid w-full grid-cols-2 mb-4'>
                <TabsTrigger value='search'>Search Results</TabsTrigger>
                <TabsTrigger value='report' disabled={!report}>
                  Report
                </TabsTrigger>
              </TabsList>

              <TabsContent value='search' className='space-y-4'>
                {!isAgentMode &&
                  results
                    .filter((r) => r.isCustomUrl)
                    .map((result) => (
                      <Card
                        key={result.id}
                        className='overflow-hidden border-2 border-blue-100'
                      >
                        <CardContent className='p-4 flex gap-4'>
                          <div className='pt-1'>
                            <Checkbox
                              checked={selectedResults.includes(result.id)}
                              onCheckedChange={() =>
                                handleResultSelect(result.id)
                              }
                              disabled={
                                !selectedResults.includes(result.id) &&
                                selectedResults.length >= MAX_SELECTIONS
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

                {results
                  .filter((r) => !r.isCustomUrl)
                  .map((result) => (
                    <Card key={result.id} className='overflow-hidden'>
                      <CardContent className='p-4 flex gap-4'>
                        <div className='pt-1'>
                          <Checkbox
                            checked={selectedResults.includes(result.id)}
                            onCheckedChange={() =>
                              handleResultSelect(result.id)
                            }
                            disabled={
                              !selectedResults.includes(result.id) &&
                              selectedResults.length >= MAX_SELECTIONS
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
                {report && (
                  <Card>
                    <CardContent className='p-6 space-y-6'>
                      <Collapsible
                        open={isSourcesOpen}
                        onOpenChange={setIsSourcesOpen}
                        className='w-full border rounded-lg p-2'
                      >
                        <CollapsibleTrigger className='flex items-center justify-between w-full'>
                          <span className='text-sm font-medium'>Overview</span>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              isSourcesOpen ? 'transform rotate-180' : ''
                            }`}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className='space-y-4 mt-2'>
                          <div className='text-sm text-gray-600 bg-gray-50 p-3 rounded'>
                            <p className='font-medium text-gray-700'>
                              {fetchStatus.successful} of{' '}
                              {report.sources.length} sources fetched
                              successfully
                            </p>
                          </div>
                          <div className='space-y-2'>
                            {report.sources.map((source) => (
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
                                      fetchStatus.sourceStatuses[source.url] ===
                                      'fetched'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-yellow-50 text-yellow-600'
                                    }`}
                                  >
                                    {fetchStatus.sourceStatuses[source.url] ===
                                    'fetched'
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
                          {report.title}
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
                      <p className='text-lg text-gray-700'>{report.summary}</p>
                      {report.sections.map((section, index) => (
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
