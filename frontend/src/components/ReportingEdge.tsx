import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react';
import { reportingEdgePath } from '../layout/autoLayout';

export interface ReportingEdgeData extends Record<string, unknown> {
  row: number;
  targetWidth: number;
}

export type ReportingEdgeType = Edge<ReportingEdgeData, 'reporting'>;

export function ReportingEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
  style,
}: EdgeProps<ReportingEdgeType>) {
  const path = reportingEdgePath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    data?.targetWidth ?? 0,
    data?.row ?? 0,
  );
  return <BaseEdge path={path} markerEnd={markerEnd} style={style} />;
}