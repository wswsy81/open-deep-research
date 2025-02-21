'use client'

import { useState, useCallback } from 'react'
import type {
  Node,
  Edge,
  Connection,
  NodeTypes,
  EdgeTypes,
  NodeChange,
  EdgeChange,
  XYPosition,
} from '@xyflow/react'
import { ReactFlow, Controls, Background, addEdge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Brain, Search } from 'lucide-react'
import { SearchNode } from '@/components/flow/search-node'
import { ReportNode } from '@/components/flow/report-node'
import { SelectionNode } from '@/components/flow/selection-node'
import { QuestionNode } from '@/components/flow/question-node'
import type { SearchResult, Report } from '@/types'

// Define custom node types
const nodeTypes: NodeTypes = {
  searchNode: SearchNode,
  reportNode: ReportNode,
  selectionNode: SelectionNode,
  questionNode: QuestionNode,
}

const DEFAULT_MODEL = 'google__gemini-flash'

interface FlowNode extends Node {
  id: string
  type: string
  position: XYPosition
  data: {
    query?: string
    loading?: boolean
    results?: SearchResult[]
    report?: Report
    question?: string
    onGenerateReport?: (selectedResults: SearchResult[]) => void
    onApprove?: () => void
    hasChildren?: boolean
    onConsolidate?: () => void
  }
}

export default function FlowPage() {
  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [reports, setReports] = useState<Record<string, Report>>({})
  const [reportChains, setReportChains] = useState<Record<string, {
    parentId: string | null;
    childIds: string[];
    report: Report;
  }>>({})

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      return changes.reduce((acc, change) => {
        if (change.type === 'position' && change.position) {
          return acc.map((node) =>
            node.id === change.id
              ? { ...node, position: change.position as XYPosition }
              : node
          )
        }
        return acc
      }, nds)
    })
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => {
      return changes.reduce((acc, change) => {
        if (change.type === 'remove') {
          return acc.filter((edge) => edge.id !== change.id)
        }
        return acc
      }, eds)
    })
  }, [])

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds))
    },
    []
  )

  const createNode = (
    type: string,
    position: XYPosition,
    data: FlowNode['data']
  ): FlowNode => ({
    id: `${type}-${Date.now()}`,
    type,
    position,
    data,
  })

  const handleStartResearch = async () => {
    // Find if there's an existing search node that's loading
    const pendingSearchNode = nodes.find(
      node => node.type === 'searchNode' && node.data.loading
    )
    
    if (!pendingSearchNode) {
      // This is a new search from the input field
      if (!query.trim()) return
      setLoading(true)

      try {
        // Calculate position for new nodes based on existing nodes
        const existingNodes = nodes.filter(node => 
          typeof node.position.x === 'number' && 
          typeof node.position.y === 'number' &&
          !isNaN(node.position.x) && 
          !isNaN(node.position.y)
        )
        
        const startY = existingNodes.length > 0 
          ? Math.max(...existingNodes.map(n => n.position.y)) + 200
          : 50

        // Create initial search node
        const searchNode = createNode('searchNode', { 
          x: 250, 
          y: Math.max(50, startY) // Ensure minimum Y position
        }, { 
          query, 
          loading: true 
        })

        // Add new node while preserving existing ones
        setNodes((nds) => [...nds, searchNode])

        await performSearch(searchNode)
      } catch (error) {
        console.error('Search error:', error)
        setNodes((nds) => 
          nds.map(node => 
            node.type === 'searchNode' && node.data.loading
              ? { ...node, data: { ...node.data, loading: false, error: 'Search failed' } }
              : node
          )
        )
      } finally {
        setLoading(false)
      }
    } else {
      // This is a branch search
      try {
        await performSearch(pendingSearchNode)
      } catch (error) {
        console.error('Search error:', error)
        setNodes((nds) => 
          nds.map(node => 
            node.id === pendingSearchNode.id
              ? { ...node, data: { ...node.data, loading: false, error: 'Search failed' } }
              : node
          )
        )
      }
    }
  }

  const performSearch = async (searchNode: FlowNode) => {
    if (!searchNode?.position || !searchNode.data.query) return

    // Perform search
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: searchNode.data.query,
        timeFilter: 'all',
        platformModel: DEFAULT_MODEL,
      }),
    })

    if (!response.ok) throw new Error('Search failed')
    const searchResults = await response.json()

    // Create selection node with validated position
    const selectionNode = createNode('selectionNode', 
      { 
        x: Math.max(0, searchNode.position.x || 250), 
        y: Math.max(50, (searchNode.position.y || 0) + 150)
      }, 
      {
        results: searchResults.webPages?.value || [],
        onGenerateReport: handleGenerateReport,
      }
    )

    // Update search node and add selection node
    setNodes((nds) => {
      const updatedNodes = nds.map(node => 
        node.id === searchNode.id 
          ? { ...node, data: { ...node.data, loading: false } }
          : node
      )
      return [...updatedNodes, selectionNode]
    })

    // Add edge between search and selection
    setEdges((eds) => [
      ...eds,
      {
        id: `edge-${searchNode.id}-${selectionNode.id}`,
        source: searchNode.id,
        target: selectionNode.id,
        animated: true,
      },
    ])
  }

  const handleGenerateReport = async (selectedResults: SearchResult[]) => {
    const reportNodeId = `report-${Date.now()}`
    const questionNodeId = `question-${Date.now()}`
    const selectionNode = nodes.find(node => node.type === 'selectionNode')
    const searchNode = nodes.find(node => 
      node.type === 'searchNode' && 
      edges.some(edge => edge.target === selectionNode?.id && edge.source === node.id)
    )
    
    if (!selectionNode?.position || !searchNode?.data.query) return

    try {
      // Create report node with validated position
      const reportNode = createNode('reportNode', { 
        x: Math.max(0, selectionNode.position.x || 250), 
        y: Math.max(50, (selectionNode.position.y || 0) + 200)
      }, { 
        loading: true,
        report: undefined,
        query: searchNode.data.query
      })

      // Create question node with validated position
      const questionNode = createNode('questionNode', { 
        x: Math.max(0, selectionNode.position.x || 250), 
        y: Math.max(50, (selectionNode.position.y || 0) + 400)
      }, { 
        loading: true,
        question: undefined
      })

      // Add nodes and edges
      setNodes((nds) => [...nds, reportNode, questionNode])
      setEdges((eds) => [
        ...eds,
        {
          id: `edge-selection-${reportNodeId}`,
          source: selectionNode.id,
          target: reportNode.id,
          animated: true,
        },
        {
          id: `edge-${reportNodeId}-${questionNodeId}`,
          source: reportNode.id,
          target: questionNode.id,
          animated: true,
        },
      ])

      // Fetch content for each selected result
      const contentResults = await Promise.all(
        selectedResults.map(async (article) => {
          try {
            const { content } = await fetch('/api/fetch-content', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: article.url }),
            }).then(res => res.json())

            if (content) {
              return { url: article.url, title: article.name, content }
            }
          } catch (error) {
            console.error('Content fetch error for article:', article.url, error)
          }
          return {
            url: article.url,
            title: article.name,
            content: article.snippet,
          }
        })
      )

      // Generate report
      const reportResponse = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedResults: contentResults.filter((r) => r.content?.trim()),
          sources: selectedResults,
          prompt: `${searchNode.data.query}. Provide comprehensive analysis.`,
          platformModel: DEFAULT_MODEL,
        }),
      })

      if (!reportResponse.ok) throw new Error('Failed to generate report')
      const report = await reportResponse.json()

      // Store report and update report chains
      const parentReportId = nodes.find(node => 
        node.type === 'reportNode' && 
        edges.some(edge => edge.target === reportNode.id && edge.source === node.id)
      )?.id

      setReports((prev) => ({ ...prev, [reportNodeId]: report }))
      setReportChains((prev) => ({
        ...prev,
        [reportNodeId]: {
          parentId: parentReportId || null,
          childIds: [],
          report
        },
        ...(parentReportId ? {
          [parentReportId]: {
            ...prev[parentReportId],
            childIds: [...(prev[parentReportId]?.childIds || []), reportNodeId]
          }
        } : {})
      }))

      // Generate follow-up question
      const questionResponse = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report,
          platformModel: DEFAULT_MODEL,
        }),
      })

      if (!questionResponse.ok) throw new Error('Failed to generate question')
      const { question } = await questionResponse.json()

      // Update nodes with data
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === reportNode.id) {
            return {
              ...node,
              data: {
                ...node.data,
                report: {
                  title: report.title,
                  summary: report.summary,
                  sections: report.sections,
                  sources: report.sources
                },
                loading: false,
                hasChildren: false,
                onConsolidate: () => consolidateReports(node.id)
              },
            }
          }
          if (node.id === questionNode.id) {
            return {
              ...node,
              data: {
                ...node.data,
                question,
                loading: false,
                onApprove: () => handleStartNewBranch(question, reportNode.id),
              },
            }
          }
          return node
        })
      )

      // Update parent node if it exists to show it has children
      if (parentReportId) {
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === parentReportId) {
              return {
                ...node,
                data: {
                  ...node.data,
                  hasChildren: true,
                },
              }
            }
            return node
          })
        )
      }
    } catch (error) {
      console.error('Report generation error:', error)
      // Update nodes to show error state
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === reportNodeId || node.id === questionNodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                loading: false,
                error: 'Failed to generate report',
              },
            }
          }
          return node
        })
      )
    }
  }

  const handleStartNewBranch = (newQuery: string, parentReportId: string) => {
    // Find the parent report node to position the new branch
    const parentNode = nodes.find(node => node.id === parentReportId)
    if (!parentNode?.position) return

    // Calculate position for new branch with validated coordinates
    const startX = Math.max(0, (parentNode.position.x || 0) + 400)
    const startY = Math.max(50, parentNode.position.y || 0)

    // Create new search node for the branch
    const searchNode = createNode('searchNode', { x: startX, y: startY }, { 
      query: newQuery, 
      loading: true 
    })

    // Add new search node
    setNodes((nds) => [...nds, searchNode])

    // Add edge from parent report to new search
    setEdges((eds) => [
      ...eds,
      {
        id: `edge-${parentReportId}-${searchNode.id}`,
        source: parentReportId,
        target: searchNode.id,
        animated: true,
        type: 'branch',
      },
    ])

    // Start the research process with the new query
    handleStartResearch()
  }

  const consolidateReports = async (rootReportId: string) => {
    // Get all reports in the chain
    const reportChain = []
    let currentId: string | null = rootReportId
    
    while (currentId) {
      const chainNode: {
        parentId: string | null;
        childIds: string[];
        report: Report;
      } = reportChains[currentId]
      if (!chainNode) break
      
      reportChain.push({
        query: nodes.find(node => node.id === currentId)?.data?.query || '',
        report: chainNode.report
      })
      
      // If this node has multiple children, we'll need user input to choose which branch
      if (chainNode.childIds.length > 1) {
        // For now, we'll just take the first branch
        currentId = chainNode.childIds[0] || null
      } else {
        currentId = chainNode.childIds[0] || null
      }
    }

    // Generate consolidated report
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedResults: [], // No direct sources for consolidated report
          sources: [], // No direct sources for consolidated report
          prompt: `Create a comprehensive consolidated report that synthesizes the following research chain. Each report builds upon the previous findings:

${reportChain.map((item, index) => `
Report ${index + 1} Query: ${item.query}
Report ${index + 1} Title: ${item.report.title}
Report ${index + 1} Summary: ${item.report.summary}
`).join('\n')}

Provide a cohesive analysis that shows how the research evolved and what key insights were discovered along the way.`,
          platformModel: DEFAULT_MODEL,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate consolidated report')
      const consolidatedReport = await response.json()

      // Find the root report node
      const rootNode = nodes.find(node => node.id === rootReportId)
      if (!rootNode?.position) throw new Error('Root node not found')

      // Create consolidated report node with validated position
      const consolidatedNodeId = `consolidated-${Date.now()}`
      const consolidatedNode = createNode('reportNode', 
        { 
          x: Math.max(0, (rootNode.position.x || 0) + 300),
          y: Math.max(50, rootNode.position.y || 0)
        },
        { 
          report: consolidatedReport,
          loading: false,
        }
      )

      // Add consolidated node and connect it
      setNodes((nds) => [...nds, consolidatedNode])
      setEdges((eds) => [
        ...eds,
        {
          id: `edge-${rootReportId}-${consolidatedNodeId}`,
          source: rootReportId,
          target: consolidatedNodeId,
          animated: true,
          type: 'consolidated',
        },
      ])

      // Store consolidated report
      setReports((prev) => ({ ...prev, [consolidatedNodeId]: consolidatedReport }))
    } catch (error) {
      console.error('Failed to consolidate reports:', error)
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="p-4 border-b">
        <div className="max-w-4xl mx-auto flex gap-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What would you like to research?"
            className="flex-1"
          />
          <Button
            onClick={handleStartResearch}
            disabled={loading || !query.trim()}
            className="gap-2"
          >
            {loading ? (
              <>
                <Brain className="h-4 w-4 animate-spin" />
                Researching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Start Research
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
} 