'use client'

import { useState, useCallback } from 'react'
import type { Node, Edge, Connection, NodeTypes, NodeChange, EdgeChange, XYPosition } from '@xyflow/react'
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

const nodeTypes: NodeTypes = {
  searchNode: SearchNode,
  reportNode: ReportNode,
  selectionNode: SelectionNode,
  questionNode: QuestionNode,
}

const DEFAULT_MODEL = 'google__gemini-flash'

interface ResearchNode extends Node {
  data: {
    query?: string
    loading?: boolean
    results?: SearchResult[]
    report?: Report
    question?: string
    parentId?: string
    childIds?: string[]
    onGenerateReport?: (selectedResults: SearchResult[]) => void
    onApprove?: () => void
    onConsolidate?: () => void
    hasChildren?: boolean
    error?: string
  }
}

export default function FlowPage() {
  const [nodes, setNodes] = useState<ResearchNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      return changes.reduce((acc: ResearchNode[], change) => {
        if (change.type === 'position' && change.position) {
          const pos = change.position as XYPosition
          // Ensure position values are valid numbers
          if (isNaN(pos.x) || isNaN(pos.y)) return acc
          return acc.map((node) =>
            node.id === change.id
              ? { ...node, position: { x: Math.max(0, pos.x), y: Math.max(0, pos.y) } }
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

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds))
  }, [])

  const createNode = (type: string, position: XYPosition, data: ResearchNode['data']): ResearchNode => ({
    id: `${type}-${Date.now()}`,
    type,
    position: {
      x: Math.max(0, Math.round(position.x)),
      y: Math.max(0, Math.round(position.y))
    },
    data: { ...data, childIds: data.childIds || [] },
  })

  const calculateNewNodePosition = (parentId?: string): XYPosition => {
    if (!parentId) {
      // For root nodes, start at a fixed position if no nodes exist
      if (!nodes.length) return { x: 100, y: 100 }
      
      // Otherwise, place below the lowest node
      const validNodes = nodes.filter(n => 
        !isNaN(n.position.x) && 
        !isNaN(n.position.y) && 
        typeof n.position.x === 'number' && 
        typeof n.position.y === 'number'
      )
      
      if (!validNodes.length) return { x: 100, y: 100 }
      
      const maxY = Math.max(...validNodes.map(n => n.position.y))
      return { x: 100, y: maxY + 200 }
    }
    
    const parent = nodes.find(n => n.id === parentId)
    if (!parent || isNaN(parent.position.x) || isNaN(parent.position.y)) {
      return { x: 100, y: 100 }
    }

    const siblings = nodes.filter(n => 
      n.data.parentId === parentId && 
      !isNaN(n.position.x) && 
      !isNaN(n.position.y)
    )

    return {
      x: Math.max(0, parent.position.x + 400),
      y: Math.max(0, parent.position.y + (siblings.length * 300))
    }
  }

  const handleStartResearch = async (parentReportId?: string) => {
    if (!query.trim()) return
    
    setLoading(true)
    try {
      const position = calculateNewNodePosition(parentReportId)
      const searchNode = createNode('searchNode', position, { 
        query, 
        loading: true, 
        parentId: parentReportId,
        childIds: []
      })
      
      setNodes(nds => {
        if (parentReportId) {
          return nds.map(node => 
            node.id === parentReportId 
              ? { ...node, data: { ...node.data, childIds: [...(node.data.childIds || []), searchNode.id] } }
              : node
          ).concat(searchNode)
        }
        return [...nds, searchNode]
      })

      if (parentReportId) {
        setEdges(eds => [...eds, {
          id: `edge-${parentReportId}-${searchNode.id}`,
          source: parentReportId,
          target: searchNode.id,
          animated: true,
          type: 'branch'
        }])
      }

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          timeFilter: 'all',
          platformModel: DEFAULT_MODEL 
        }),
      })

      if (!response.ok) throw new Error('Search failed')
      const { webPages } = await response.json()

      const selectionPosition = { 
        x: position.x, 
        y: position.y + 200 
      }
      
      const selectionNode = createNode('selectionNode', selectionPosition, {
        results: webPages?.value || [],
        onGenerateReport: (selected) => handleGenerateReport(selected, searchNode.id),
        parentId: searchNode.id,
        childIds: []
      })

      setNodes(nds => {
        const updatedNodes = nds.map(node => 
          node.id === searchNode.id 
            ? { ...node, data: { ...node.data, loading: false } }
            : node
        )
        return [...updatedNodes, selectionNode]
      })

      setEdges(eds => [...eds, {
        id: `edge-${searchNode.id}-${selectionNode.id}`,
        source: searchNode.id,
        target: selectionNode.id,
        animated: true
      }])
    } catch (error) {
      console.error('Search error:', error)
      setNodes(nds => nds.map(node => 
        node.data.loading ? { ...node, data: { ...node.data, loading: false, error: 'Search failed' } } : node
      ))
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateReport = async (selectedResults: SearchResult[], searchNodeId: string) => {
    const searchNode = nodes.find(n => n.id === searchNodeId)
    if (!searchNode?.data.query || isNaN(searchNode.position.x) || isNaN(searchNode.position.y)) return

    const reportPosition = calculateNewNodePosition(searchNodeId)
    const reportNode = createNode('reportNode', reportPosition, {
      loading: true,
      parentId: searchNodeId,
      childIds: [],
      hasChildren: false
    })

    const questionPosition = { 
      x: Math.max(0, reportPosition.x), 
      y: Math.max(0, reportPosition.y + 200)
    }
    
    const questionNode = createNode('questionNode', questionPosition, { 
      loading: true,
      parentId: reportNode.id,
      childIds: []
    })

    setNodes(nds => [...nds, reportNode, questionNode])
    setEdges(eds => [
      ...eds,
      {
        id: `edge-${searchNodeId}-${reportNode.id}`,
        source: searchNodeId,
        target: reportNode.id,
        animated: true
      },
      {
        id: `edge-${reportNode.id}-${questionNode.id}`,
        source: reportNode.id,
        target: questionNode.id,
        animated: true
      }
    ])

    try {
      // Fetch content for selected results
      const contentResults = await Promise.all(
        selectedResults.map(async (result) => {
          try {
            const response = await fetch('/api/fetch-content', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: result.url }),
            })
            const { content } = await response.json()
            return { 
              url: result.url, 
              title: result.name, 
              content: content || result.snippet 
            }
          } catch (error) {
            console.error('Content fetch error:', error)
            return { 
              url: result.url, 
              title: result.name, 
              content: result.snippet 
            }
          }
        })
      )

      // Generate report
      const reportResponse = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedResults: contentResults,
          sources: selectedResults,
          prompt: `${searchNode.data.query}. Provide comprehensive analysis.`,
          platformModel: DEFAULT_MODEL,
        }),
      })

      if (!reportResponse.ok) throw new Error('Failed to generate report')
      const report: Report = await reportResponse.json()

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

      setNodes(nds => nds.map(node => {
        if (node.id === reportNode.id) {
          return {
            ...node,
            data: {
              ...node.data,
              report,
              loading: false,
              onConsolidate: () => consolidateReports(node.id)
            }
          }
        }
        if (node.id === questionNode.id) {
          return {
            ...node,
            data: {
              ...node.data,
              question,
              loading: false,
              onApprove: () => {
                setQuery(question)
                handleStartResearch(reportNode.id)
              }
            }
          }
        }
        return node
      }))
    } catch (error) {
      console.error('Report generation error:', error)
      setNodes(nds => nds.map(node => 
        (node.id === reportNode.id || node.id === questionNode.id)
          ? { ...node, data: { ...node.data, loading: false, error: 'Generation failed' } }
          : node
      ))
    }
  }

  const consolidateReports = async (reportId: string) => {
    const reportChain = getReportChain(reportId)
    if (!reportChain.length) return

    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedResults: [],
          sources: [],
          prompt: `Create a comprehensive consolidated report that synthesizes the following research chain. Each report builds upon the previous findings:

${reportChain.map((item, index) => `
Report ${index + 1} Title: ${item.title}
Report ${index + 1} Summary: ${item.summary}
`).join('\n')}

Provide a cohesive analysis that shows how the research evolved and what key insights were discovered along the way.`,
          platformModel: DEFAULT_MODEL,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate consolidated report')
      const consolidated: Report = await response.json()

      const rootNode = nodes.find(n => n.id === reportId)
      if (!rootNode || isNaN(rootNode.position.x) || isNaN(rootNode.position.y)) {
        throw new Error('Root node not found or has invalid position')
      }

      const consolidatedPosition = {
        x: Math.max(0, rootNode.position.x + 300),
        y: Math.max(0, rootNode.position.y)
      }

      const consolidatedNode = createNode('reportNode', consolidatedPosition, {
        report: consolidated,
        loading: false,
        parentId: reportId,
        childIds: [],
        hasChildren: false
      })

      setNodes(nds => [...nds, consolidatedNode])
      setEdges(eds => [...eds, {
        id: `edge-${reportId}-${consolidatedNode.id}`,
        source: reportId,
        target: consolidatedNode.id,
        animated: true,
        type: 'consolidated'
      }])
    } catch (error) {
      console.error('Consolidation error:', error)
    }
  }

  const getReportChain = (reportId: string): Report[] => {
    const chain: Report[] = []
    let currentNode = nodes.find(n => n.id === reportId)
    
    while (currentNode?.data.report) {
      chain.push(currentNode.data.report)
      currentNode = nodes.find(n => n.id === currentNode?.data.parentId)
    }
    
    return chain.reverse()
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="p-4 border-b">
        <div className="max-w-4xl mx-auto flex gap-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter research topic"
            className="flex-1"
          />
          <Button
            onClick={() => handleStartResearch()}
            disabled={loading}
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
          minZoom={0.1}
          maxZoom={1.5}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}