import { useState, useEffect } from 'react'
import type { Node, Edge } from '@xyflow/react'
import {
  getLocalStorageUsage,
  formatBytes,
  exportFlowProjects,
  importFlowProjects,
} from '@/lib/localStorage-utils'

export interface FlowProject {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  nodes: Node[]
  edges: Edge[]
  query: string
  selectedReports?: string[]
}

interface StorageInfo {
  usage: number
  usagePercent: number
  available: number
  limit: number
  formattedUsage: string
  formattedAvailable: string
}

interface UseFlowProjectsReturn {
  projects: FlowProject[]
  currentProject: FlowProject | null
  setCurrentProject: (project: FlowProject) => void
  createProject: (name: string) => FlowProject
  updateCurrentProject: (
    data: Partial<Omit<FlowProject, 'id' | 'createdAt'>>
  ) => void
  deleteProject: (id: string) => void
  saveCurrentState: (
    nodes: Node[],
    edges: Edge[],
    query: string,
    selectedReports?: string[]
  ) => void
  exportProjects: () => string
  importProjects: (jsonData: string) => boolean
  storageInfo: StorageInfo
  refreshStorageInfo: () => void
}

const LOCAL_STORAGE_KEY = 'open-deep-research-flow-projects'
const CURRENT_PROJECT_KEY = 'open-deep-research-current-project'

export function useFlowProjects(): UseFlowProjectsReturn {
  const [projects, setProjects] = useState<FlowProject[]>([])
  const [currentProject, setCurrentProject] = useState<FlowProject | null>(null)
  const [storageInfo, setStorageInfo] = useState<StorageInfo>(() => {
    const info = getLocalStorageUsage()
    return {
      ...info,
      formattedUsage: formatBytes(info.usage),
      formattedAvailable: formatBytes(info.available),
    }
  })

  // Load projects from localStorage
  useEffect(() => {
    try {
      const savedProjects = localStorage.getItem(LOCAL_STORAGE_KEY)
      const savedCurrentProjectId = localStorage.getItem(CURRENT_PROJECT_KEY)

      if (savedProjects) {
        const parsedProjects = JSON.parse(savedProjects) as FlowProject[]
        setProjects(parsedProjects)

        if (savedCurrentProjectId) {
          const current = parsedProjects.find(
            (p) => p.id === savedCurrentProjectId
          )
          if (current) {
            setCurrentProject(current)
          }
        } else if (parsedProjects.length > 0) {
          // Default to the most recently updated project
          const mostRecent = [...parsedProjects].sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )[0]
          setCurrentProject(mostRecent)
          localStorage.setItem(CURRENT_PROJECT_KEY, mostRecent.id)
        }
      }

      refreshStorageInfo()
    } catch (error) {
      console.error('Failed to load projects from localStorage:', error)
    }
  }, [])

  // Save projects to localStorage whenever they change
  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects))
      refreshStorageInfo()
    }
  }, [projects])

  // Save current project ID whenever it changes
  useEffect(() => {
    if (currentProject) {
      localStorage.setItem(CURRENT_PROJECT_KEY, currentProject.id)
    }
  }, [currentProject])

  const refreshStorageInfo = () => {
    const info = getLocalStorageUsage()
    setStorageInfo({
      ...info,
      formattedUsage: formatBytes(info.usage),
      formattedAvailable: formatBytes(info.available),
    })
  }

  const createProject = (name: string): FlowProject => {
    const now = new Date().toISOString()
    const newProject: FlowProject = {
      id: `project-${Date.now()}`,
      name,
      createdAt: now,
      updatedAt: now,
      nodes: [],
      edges: [],
      query: '',
      selectedReports: [],
    }

    setProjects((prev) => [...prev, newProject])
    setCurrentProject(newProject)
    refreshStorageInfo()
    return newProject
  }

  const updateCurrentProject = (
    data: Partial<Omit<FlowProject, 'id' | 'createdAt'>>
  ) => {
    if (!currentProject) return

    const updatedProject = {
      ...currentProject,
      ...data,
      updatedAt: new Date().toISOString(),
    }

    setCurrentProject(updatedProject)
    setProjects((prev) =>
      prev.map((p) => (p.id === currentProject.id ? updatedProject : p))
    )
  }

  const deleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id))

    if (currentProject?.id === id) {
      const remainingProjects = projects.filter((p) => p.id !== id)
      if (remainingProjects.length > 0) {
        setCurrentProject(remainingProjects[0])
      } else {
        setCurrentProject(null)
        localStorage.removeItem(CURRENT_PROJECT_KEY)
      }
    }

    refreshStorageInfo()
  }

  const saveCurrentState = (
    nodes: Node[],
    edges: Edge[],
    query: string,
    selectedReports: string[] = []
  ) => {
    if (currentProject) {
      updateCurrentProject({ nodes, edges, query, selectedReports })
    } else if (nodes.length > 0 || edges.length > 0) {
      // Create a default project if we have data but no current project
      const newProject = createProject('Untitled Research')
      updateCurrentProject({ nodes, edges, query, selectedReports })
    }
  }

  const exportProjects = (): string => {
    return exportFlowProjects()
  }

  const importProjectsData = (jsonData: string): boolean => {
    const success = importFlowProjects(jsonData)
    if (success) {
      // Reload projects from localStorage after import
      try {
        const savedProjects = localStorage.getItem(LOCAL_STORAGE_KEY)
        const savedCurrentProjectId = localStorage.getItem(CURRENT_PROJECT_KEY)

        if (savedProjects) {
          const parsedProjects = JSON.parse(savedProjects) as FlowProject[]
          setProjects(parsedProjects)

          if (savedCurrentProjectId) {
            const current = parsedProjects.find(
              (p) => p.id === savedCurrentProjectId
            )
            if (current) {
              setCurrentProject(current)
            } else if (parsedProjects.length > 0) {
              setCurrentProject(parsedProjects[0])
            }
          } else if (parsedProjects.length > 0) {
            setCurrentProject(parsedProjects[0])
          }
        }

        refreshStorageInfo()
      } catch (error) {
        console.error('Failed to reload projects after import:', error)
      }
    }
    return success
  }

  return {
    projects,
    currentProject,
    setCurrentProject,
    createProject,
    updateCurrentProject,
    deleteProject,
    saveCurrentState,
    exportProjects,
    importProjects: importProjectsData,
    storageInfo,
    refreshStorageInfo,
  }
}
