// Copyright (c) 2026 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

import * as React from 'react';

import { IViewRangeTime, ViewRangeTimeUpdate } from '../types';

import './TimelineCursor.css';

// The timeline cell of a span row; see SpanBarRow.
const SPAN_TIMELINE_CELL_SELECTOR = '.span-view';

/**
 * Maps a horizontal mouse position over a span row's timeline cell to a
 * cursor value, i.e. a fraction of the whole trace duration, so it lines up
 * with the cursor set by the minimap and the timeline header.
 */
export function getCursorFromPosition(
  clientX: number,
  cellLeft: number,
  cellWidth: number,
  viewStart: number,
  viewEnd: number
): number | null {
  if (cellWidth <= 0) {
    return null;
  }
  const subRange = Math.min(Math.max((clientX - cellLeft) / cellWidth, 0), 1);
  return viewStart + subRange * (viewEnd - viewStart);
}

/**
 * Tracks the mouse over the span rows and updates the shared view range
 * cursor, which also drives the cursor line in the minimap. Updates are
 * batched to one per animation frame.
 */
export function useTimelineRowsCursor(
  viewRangeTime: IViewRangeTime,
  updateNextViewRangeTime: (update: ViewRangeTimeUpdate) => void
) {
  const latest = React.useRef({ viewRangeTime, updateNextViewRangeTime });
  React.useLayoutEffect(() => {
    latest.current = { viewRangeTime, updateNextViewRangeTime };
  });
  const frame = React.useRef<number | null>(null);
  const pendingCursor = React.useRef<number | null>(null);

  const cancelFrame = React.useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);

  React.useEffect(() => cancelFrame, [cancelFrame]);

  const onMouseMove = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    const { current, cursor, reframe, shiftEnd, shiftStart } = latest.current.viewRangeTime;
    // Leave the cursor alone while the header is being dragged to zoom.
    if (reframe || shiftEnd != null || shiftStart != null) {
      return;
    }
    const cell = (event.target as Element).closest?.(SPAN_TIMELINE_CELL_SELECTOR);
    let next: number | null = null;
    if (cell) {
      const { left, width } = cell.getBoundingClientRect();
      next = getCursorFromPosition(event.clientX, left, width, current[0], current[1]);
    }
    if (next === null && cursor == null && frame.current === null) {
      return;
    }
    pendingCursor.current = next;
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        latest.current.updateNextViewRangeTime({ cursor: pendingCursor.current ?? undefined });
      });
    }
  }, []);

  const onMouseLeave = React.useCallback(() => {
    cancelFrame();
    if (latest.current.viewRangeTime.cursor != null) {
      latest.current.updateNextViewRangeTime({ cursor: undefined });
    }
  }, [cancelFrame]);

  return { onMouseMove, onMouseLeave };
}

type TCursorGuideProps = {
  nameColumnWidth: number;
  viewRangeTime: IViewRangeTime;
};

/**
 * A vertical line across the span rows at the shared cursor position,
 * continuing the cursor line drawn in the timeline header.
 */
export function TimelineRowsCursorGuide({ nameColumnWidth, viewRangeTime }: TCursorGuideProps) {
  const { current, cursor, reframe, shiftEnd, shiftStart } = viewRangeTime;
  const [viewStart, viewEnd] = current;
  const isDragging = Boolean(reframe) || shiftEnd != null || shiftStart != null;
  if (isDragging || cursor == null || cursor < viewStart || cursor > viewEnd || viewEnd <= viewStart) {
    return null;
  }
  const subRange = (cursor - viewStart) / (viewEnd - viewStart);
  const left = (nameColumnWidth + subRange * (1 - nameColumnWidth)) * 100;
  return (
    <div
      className="TimelineRowsCursorGuide"
      data-testid="timeline-rows-cursor"
      style={{ left: `${left}%` }}
    />
  );
}
