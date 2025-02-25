import { getBezierPath, EdgeProps } from '@xyflow/react'

export function ConsolidatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <path
      id={id}
      style={{
        ...style,
        strokeWidth: 2,
        stroke: '#6366f1', // Indigo color for consolidated edges
        strokeDasharray: '5,5', // Dashed line pattern
      }}
      className='react-flow__edge-path'
      d={edgePath}
      markerEnd={markerEnd}
    />
  )
}
