'use client'

import { useState, useCallback } from 'react'
import type {
  Node,
  Edge,
  Connection,
  NodeTypes,
  NodeChange,
  EdgeChange,
  XYPosition,
} from '@xyflow/react'
import {
  ReactFlow,
  Controls,
  Background,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MiniMap,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Brain, Search, FileText, Loader2 } from 'lucide-react'
import { SearchNode } from '@/components/flow/search-node'
import { ReportNode } from '@/components/flow/report-node'
import { SelectionNode } from '@/components/flow/selection-node'
import { QuestionNode } from '@/components/flow/question-node'
import type { SearchResult, Report } from '@/types'
import { ModelSelect, DEFAULT_MODEL } from '@/components/model-select'
import { handleLocalFile } from '@/lib/file-upload'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

const nodeTypes: NodeTypes = {
  searchNode: SearchNode,
  reportNode: ReportNode,
  selectionNode: SelectionNode,
  questionNode: QuestionNode,
}

interface ResearchNode extends Node {
  data: {
    query?: string
    loading?: boolean
    results?: SearchResult[]
    report?: Report
    searchTerms?: string[]
    question?: string
    parentId?: string
    childIds?: string[]
    onGenerateReport?: (selectedResults: SearchResult[], prompt: string) => void
    onApprove?: (term?: string) => void
    onConsolidate?: () => void
    hasChildren?: boolean
    error?: string
    isSelected?: boolean
    onSelect?: (id: string) => void
    isConsolidated?: boolean
    isConsolidating?: boolean
    onFileUpload?: (file: File) => void
  }
}

export default function FlowPage() {
  const [nodes, setNodes] = useState<ResearchNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedReports, setSelectedReports] = useState<string[]>([])
  const [isConsolidating, setIsConsolidating] = useState(false)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const { toast } = useToast()

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  )

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    []
  )

  const createNode = (
    type: string,
    position: XYPosition,
    data: ResearchNode['data'],
    parentId?: string
  ): ResearchNode => {
    const id = `${type}-${Date.now()}`

    let zIndex = 0
    switch (type) {
      case 'group':
        zIndex = 0
        break
      case 'searchNode':
        zIndex = 1
        break
      case 'selectionNode':
        zIndex = 2
        break
      case 'reportNode':
      case 'questionNode':
        zIndex = 3
        break
      default:
        zIndex = 1
    }

    const nodeData =
      type === 'reportNode'
        ? {
            ...data,
            childIds: data.childIds || [],
            isSelected: selectedReports.includes(id),
            onSelect: (id: string) => handleReportSelect(id),
            isConsolidating,
          }
        : { ...data, childIds: data.childIds || [] }

    return {
      id,
      type,
      position: {
        x: Math.max(0, Math.round(position.x)),
        y: Math.max(0, Math.round(position.y)),
      },
      data: nodeData,
      parentId,
      extent: 'parent',
      zIndex,
    }
  }

  const createGroupNode = (
    position: XYPosition,
    query: string
  ): ResearchNode => ({
    id: `group-${Date.now()}`,
    type: 'group',
    position,
    style: {
      width: 800,
      height: 1600,
      padding: 60,
      backgroundColor: 'rgba(240, 240, 240, 0.5)',
      borderRadius: 8,
    },
    data: {
      query,
      childIds: [],
    },
    zIndex: 0,
  })

  const handleFileUpload = async (
    file: File,
    searchNodeId: string,
    groupId: string
  ) => {
    const result = await handleLocalFile(
      file,
      (loading) => {
        setNodes((nds) =>
          nds.map((node) =>
            node.id === searchNodeId
              ? { ...node, data: { ...node.data, loading } }
              : node
          )
        )
      },
      (error, context) => {
        toast({
          title: context,
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        })
      }
    )

    if (result) {
      setNodes((nds) => {
        const selectionNode = nds.find(
          (n) => n.type === 'selectionNode' && n.parentId === groupId
        )

        if (selectionNode) {
          return nds.map((node) =>
            node.id === selectionNode.id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    results: [result, ...(node.data.results || [])],
                  },
                }
              : node.id === searchNodeId
              ? { ...node, data: { ...node.data, loading: false } }
              : node
          )
        }

        const newSelectionNode = createNode(
          'selectionNode',
          { x: 100, y: 200 },
          {
            results: [result],
            onGenerateReport: (selected, prompt) => {
              handleGenerateReport(selected, searchNodeId, groupId, prompt)
            },
            childIds: [],
          },
          groupId
        )

        return [
          ...nds.map((n) =>
            n.id === searchNodeId
              ? { ...n, data: { ...n.data, loading: false } }
              : n
          ),
          newSelectionNode,
        ]
      })
    }
  }

  const handleStartResearch = async (parentReportId?: string) => {
    if (!query.trim()) return

    setLoading(true)
    try {
      const randomOffset = {
        x: Math.floor(Math.random() * 600) - 300,
        y: Math.floor(Math.random() * 300),
      }

      const basePosition = {
        x: parentReportId
          ? nodes.find((n) => n.id === parentReportId)?.position.x || 0
          : nodes.length * 200,
        y: parentReportId
          ? (nodes.find((n) => n.id === parentReportId)?.position.y || 0) + 400
          : 0,
      }

      const groupPosition = {
        x: Math.max(0, basePosition.x + randomOffset.x),
        y: Math.max(0, basePosition.y + randomOffset.y),
      }

      const groupNode = createGroupNode(groupPosition, query)

      const searchNode = createNode(
        'searchNode',
        { x: 100, y: 80 },
        {
          query,
          loading: true,
          childIds: [],
          onFileUpload: (file: File) =>
            handleFileUpload(file, searchNode.id, groupNode.id),
        },
        groupNode.id
      )

      setNodes((nds) => [...nds, groupNode, searchNode])

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          timeFilter: 'all',
          platformModel: selectedModel,
        }),
      })

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Search failed' }))
        throw new Error(errorData.error || `Search failed: ${response.status}`)
      }
      const data = await response.json()
      console.log('Search response:', data)

      if (!data.webPages?.value?.length) {
        throw new Error('No search results found')
      }

      const searchResults = data.webPages.value.map((result: any) => ({
        id: result.id || `result-${Date.now()}-${Math.random()}`,
        url: result.url,
        name: result.name || result.title,
        snippet: result.snippet,
        isCustomUrl: false,
      }))

      console.log('Transformed search results:', searchResults)

      const selectionNode = createNode(
        'selectionNode',
        { x: 100, y: 200 },
        {
          results: searchResults,
          onGenerateReport: (selected, prompt) => {
            console.log('Generate report clicked with:', selected, prompt)
            handleGenerateReport(selected, searchNode.id, groupNode.id, prompt)
          },
          childIds: [],
        },
        groupNode.id
      )

      setNodes((nds) => {
        const updatedNodes = nds.map((node) =>
          node.id === searchNode.id
            ? { ...node, data: { ...node.data, loading: false } }
            : node
        )
        return [...updatedNodes, selectionNode]
      })

      setEdges((eds) => [
        ...eds,
        {
          id: `edge-${searchNode.id}-${selectionNode.id}`,
          source: searchNode.id,
          target: selectionNode.id,
          animated: true,
        },
      ])
    } catch (error) {
      console.error('Search error:', error)
      setNodes((nds) =>
        nds.map((node) =>
          node.data.loading
            ? {
                ...node,
                data: {
                  ...node.data,
                  loading: false,
                  error:
                    error instanceof Error ? error.message : 'Search failed',
                },
              }
            : node
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateReport = async (
    selectedResults: SearchResult[],
    searchNodeId: string,
    groupId: string,
    prompt: string
  ) => {
    console.log('handleGenerateReport called with:', {
      selectedResults,
      searchNodeId,
      groupId,
      prompt,
    })

    if (selectedResults.length === 0) {
      console.error('No results selected')
      return
    }

    const reportNode = createNode(
      'reportNode',
      { x: 100, y: 800 },
      {
        loading: true,
        hasChildren: false,
      },
      groupId
    )

    const searchTermsNode = createNode(
      'questionNode',
      { x: 100, y: 1000 },
      {
        loading: true,
      },
      groupId
    )

    setNodes((nds) => [...nds, reportNode, searchTermsNode])

    setEdges((eds) => [
      ...eds,
      {
        id: `edge-${searchNodeId}-${reportNode.id}`,
        source: searchNodeId,
        target: reportNode.id,
        animated: true,
      },
      {
        id: `edge-${reportNode.id}-${searchTermsNode.id}`,
        source: reportNode.id,
        target: searchTermsNode.id,
        animated: true,
      },
    ])

    try {
      const contentResults = await Promise.all(
        selectedResults.map(async (result) => {
          if (result.content) {
            return {
              url: result.url,
              title: result.name,
              content: result.content,
            }
          }

          try {
            const response = await fetch('/api/fetch-content', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: result.url }),
            })
            if (!response.ok) throw new Error('Failed to fetch content')
            const { content } = await response.json()
            return {
              url: result.url,
              title: result.name,
              content: content || result.snippet,
            }
          } catch (error) {
            console.error('Content fetch error:', error)
            return {
              url: result.url,
              title: result.name,
              content: result.snippet,
            }
          }
        })
      )

      const validResults = contentResults.filter((r) => r.content?.trim())
      if (validResults.length === 0) {
        throw new Error('No valid content found in selected results')
      }

      const reportResponse = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedResults: validResults,
          sources: selectedResults,
          prompt:
            prompt || 'Provide comprehensive analysis of the selected sources.',
          platformModel: selectedModel,
        }),
      })

      if (!reportResponse.ok) {
        const errorData = await reportResponse
          .json()
          .catch(() => ({ error: 'Failed to generate report' }))
        throw new Error(
          errorData.error ||
            `Failed to generate report: ${reportResponse.status}`
        )
      }

      const report = await reportResponse.json()

      const searchTermsResponse = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report,
          platformModel: selectedModel,
        }),
      })

      if (!searchTermsResponse.ok) {
        const errorData = await searchTermsResponse
          .json()
          .catch(() => ({ error: 'Failed to generate search terms' }))
        throw new Error(
          errorData.error ||
            `Failed to generate search terms: ${searchTermsResponse.status}`
        )
      }

      const { searchTerms } = await searchTermsResponse.json()

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === reportNode.id) {
            return {
              ...node,
              data: {
                ...node.data,
                report,
                loading: false,
              },
            }
          }
          if (node.id === searchTermsNode.id) {
            return {
              ...node,
              data: {
                ...node.data,
                searchTerms,
                loading: false,
                onApprove: (term?: string) => {
                  if (term) {
                    setQuery(term)
                  }
                },
              },
            }
          }
          return node
        })
      )
    } catch (error) {
      console.error('Report generation error:', error)
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === reportNode.id || node.id === searchTermsNode.id) {
            return {
              ...node,
              data: {
                ...node.data,
                loading: false,
                error:
                  error instanceof Error ? error.message : 'Generation failed',
              },
            }
          }
          return node
        })
      )
    }
  }

  const handleReportSelect = (reportId: string) => {
    setSelectedReports((prev) => {
      const newSelected = prev.includes(reportId)
        ? prev.filter((id) => id !== reportId)
        : [...prev, reportId]

      setNodes((nds) =>
        nds.map((node) =>
          node.id === reportId
            ? {
                ...node,
                data: { ...node.data, isSelected: !prev.includes(reportId) },
              }
            : node
        )
      )

      return newSelected
    })
  }

  const handleConsolidateSelected = async () => {
    if (selectedReports.length < 2) {
      console.error('Select at least 2 reports to consolidate')
      return
    }

    setIsConsolidating(true)
    try {
      const reportsToConsolidate = nodes
        .filter((node) => selectedReports.includes(node.id) && node.data.report)
        .map((node) => node.data.report!)

      console.log('Consolidating reports:', {
        numReports: reportsToConsolidate.length,
        reportTitles: reportsToConsolidate.map((r) => r.title),
      })

      const response = await fetch('/api/consolidate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reports: reportsToConsolidate,
          platformModel: selectedModel,
        }),
      })

      if (!response.ok)
        throw new Error('Failed to generate consolidated report')
      const consolidated: Report = await response.json()

      console.log('Received consolidated report:', consolidated)

      const groupNode = createGroupNode(
        {
          x:
            Math.max(
              ...selectedReports.map(
                (id) => nodes.find((n) => n.id === id)?.position.x || 0
              )
            ) + 1000,
          y: Math.min(
            ...selectedReports.map(
              (id) => nodes.find((n) => n.id === id)?.position.y || 0
            )
          ),
        },
        'Consolidated Research'
      )

      const consolidatedNode = createNode(
        'reportNode',
        { x: 100, y: 100 },
        {
          report: consolidated,
          loading: false,
          childIds: [],
          hasChildren: false,
          isConsolidated: true,
        },
        groupNode.id
      )

      setNodes((nds) => {
        const updatedNodes = nds.map((node) => {
          if (selectedReports.includes(node.id)) {
            return {
              ...node,
              data: { ...node.data, isSelected: false },
            }
          }
          return node
        })
        return [...updatedNodes, groupNode, consolidatedNode]
      })

      setEdges((eds) => [
        ...eds,
        ...selectedReports.map((reportId) => ({
          id: `edge-${reportId}-${consolidatedNode.id}`,
          source: reportId,
          target: consolidatedNode.id,
          animated: true,
          type: 'consolidated',
        })),
      ])

      setSelectedReports([])
    } catch (error) {
      console.error('Consolidation error:', error)
    } finally {
      setIsConsolidating(false)
    }
  }

  return (
    <div className='h-screen flex flex-col'>
      <div className='p-4 border-b'>
        <div className='max-w-4xl mx-auto flex flex-col gap-4'>
          <div className='flex justify-around sm:justify-start items-center gap-2 mb-0 sm:mb-0 sm:absolute sm:top-2 sm:left-4'>
            <Button
              asChild
              variant='ghost'
              size='default'
              className='whitespace-nowrap'
            >
              <Link href='/'>Home</Link>
            </Button>
            <Button
              asChild
              variant='ghost'
              size='default'
              className='whitespace-nowrap'
            >
              <Link
                href='https://www.loom.com/share/3c4d9811ac1d47eeaa7a0907c43aef7f'
                target='_blank'
                rel='noopener noreferrer'
              >
                Watch a demo
              </Link>
            </Button>
          </div>
          <div className='flex flex-col sm:flex-row gap-4'>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Enter research topic'
              className='flex-1 min-w-0'
            />
            <Button
              onClick={() => handleStartResearch()}
              disabled={loading}
              className='gap-2 whitespace-nowrap'
            >
              {loading ? (
                <>
                  <Brain className='h-4 w-4 animate-spin' />
                  Researching...
                </>
              ) : (
                <>
                  <Search className='h-4 w-4' />
                  Start Research
                </>
              )}
            </Button>
          </div>
          <div className='flex flex-col sm:flex-row items-start sm:items-center gap-4'>
            <div className='flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto'>
              <p className='text-sm text-gray-500 whitespace-nowrap'>
                Model for report generation:
              </p>
              <ModelSelect
                value={selectedModel}
                onValueChange={setSelectedModel}
                triggerClassName='w-full sm:w-[200px]'
              />
            </div>
            <Button
              onClick={handleConsolidateSelected}
              disabled={selectedReports.length < 2 || isConsolidating}
              variant='outline'
              className='gap-2 w-full sm:w-auto sm:ml-auto'
            >
              {isConsolidating ? (
                <>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  Consolidating...
                </>
              ) : (
                <>
                  <FileText className='h-4 w-4' />
                  Consolidate Selected ({selectedReports.length})
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      <div className='flex-1 w-full'>
        {nodes.some((node) => node.data.error) && (
          <div className='p-4 mb-4 bg-red-50 border-l-4 border-red-500'>
            <div className='max-w-4xl mx-auto flex items-center gap-2 text-red-700'>
              <p className='text-sm'>
                {nodes.find((node) => node.data.error)?.data.error ||
                  'An error occurred during the operation. Please try again.'}
              </p>
            </div>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={1.5}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        >
          <MiniMap nodeStrokeWidth={3} />
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
