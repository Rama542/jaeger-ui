// Copyright (c) 2026 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { getCursorFromPosition, TimelineRowsCursorGuide, useTimelineRowsCursor } from './TimelineCursor';
import { IViewRangeTime, ViewRangeTimeUpdate } from '../types';

const viewRangeTime = (overrides: Partial<IViewRangeTime> = {}): IViewRangeTime => ({
  current: [0, 1],
  cursor: null,
  ...overrides,
});

describe('getCursorFromPosition', () => {
  it('maps a position in the cell to a fraction of the trace', () => {
    expect(getCursorFromPosition(150, 100, 200, 0, 1)).toBe(0.25);
  });

  it('accounts for a zoomed-in view range', () => {
    expect(getCursorFromPosition(200, 100, 200, 0.2, 0.6)).toBeCloseTo(0.4);
  });

  it('clamps positions outside the cell', () => {
    expect(getCursorFromPosition(50, 100, 200, 0.2, 0.6)).toBe(0.2);
    expect(getCursorFromPosition(500, 100, 200, 0.2, 0.6)).toBe(0.6);
  });

  it('returns null for an empty cell', () => {
    expect(getCursorFromPosition(100, 100, 0, 0, 1)).toBeNull();
  });
});

describe('<TimelineRowsCursorGuide>', () => {
  it('draws the line in the timeline column at the cursor', () => {
    render(<TimelineRowsCursorGuide nameColumnWidth={0.25} viewRangeTime={viewRangeTime({ cursor: 0.5 })} />);
    expect(screen.getByTestId('timeline-rows-cursor')).toHaveStyle({ left: '62.5%' });
  });

  it('positions the line relative to a zoomed-in view range', () => {
    render(
      <TimelineRowsCursorGuide
        nameColumnWidth={0.5}
        viewRangeTime={viewRangeTime({ current: [0.2, 0.6], cursor: 0.4 })}
      />
    );
    expect(screen.getByTestId('timeline-rows-cursor')).toHaveStyle({ left: '75%' });
  });

  it.each([
    ['there is no cursor', viewRangeTime()],
    ['the cursor is outside the view range', viewRangeTime({ current: [0.2, 0.6], cursor: 0.8 })],
    ['the header is being dragged', viewRangeTime({ cursor: 0.5, reframe: { anchor: 0.1, shift: 0.3 } })],
    ['a view edge is being dragged', viewRangeTime({ cursor: 0.5, shiftStart: 0.3 })],
  ])('draws nothing when %s', (_, time) => {
    render(<TimelineRowsCursorGuide nameColumnWidth={0.25} viewRangeTime={time} />);
    expect(screen.queryByTestId('timeline-rows-cursor')).not.toBeInTheDocument();
  });
});

describe('useTimelineRowsCursor', () => {
  let update: ReturnType<typeof vi.fn<(u: ViewRangeTimeUpdate) => void>>;
  const cursorOf = (call: number) => (update.mock.calls[call][0] as { cursor?: number }).cursor;

  function Rows({ time }: { time: IViewRangeTime }) {
    const handlers = useTimelineRowsCursor(time, update);
    return (
      <div data-testid="rows" {...handlers}>
        <div className="span-name-column" data-testid="name-cell" />
        <div className="span-view" data-testid="timeline-cell">
          <div data-testid="span-bar" />
        </div>
      </div>
    );
  }

  beforeEach(() => {
    update = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 200,
    } as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets the cursor when hovering over a span timeline', () => {
    render(<Rows time={viewRangeTime({ current: [0.2, 0.6] })} />);
    fireEvent.mouseMove(screen.getByTestId('span-bar'), { clientX: 200 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(cursorOf(0)).toBeCloseTo(0.4);
  });

  it('clears the cursor when moving onto the name column', () => {
    render(<Rows time={viewRangeTime({ cursor: 0.5 })} />);
    fireEvent.mouseMove(screen.getByTestId('name-cell'), { clientX: 50 });
    expect(update).toHaveBeenCalledWith({ cursor: undefined });
  });

  it('does nothing outside the timeline when there is no cursor', () => {
    render(<Rows time={viewRangeTime()} />);
    fireEvent.mouseMove(screen.getByTestId('name-cell'), { clientX: 50 });
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves the cursor alone while the header is being dragged', () => {
    render(<Rows time={viewRangeTime({ reframe: { anchor: 0.1, shift: 0.3 } })} />);
    fireEvent.mouseMove(screen.getByTestId('span-bar'), { clientX: 200 });
    expect(update).not.toHaveBeenCalled();
  });

  it('clears the cursor when the mouse leaves the rows', () => {
    render(<Rows time={viewRangeTime({ cursor: 0.5 })} />);
    fireEvent.mouseLeave(screen.getByTestId('rows'));
    expect(update).toHaveBeenCalledWith({ cursor: undefined });
  });

  it('sends at most one update per animation frame', () => {
    const frames: FrameRequestCallback[] = [];
    vi.mocked(window.requestAnimationFrame).mockImplementation(cb => {
      frames.push(cb);
      return frames.length;
    });
    render(<Rows time={viewRangeTime()} />);
    fireEvent.mouseMove(screen.getByTestId('span-bar'), { clientX: 150 });
    fireEvent.mouseMove(screen.getByTestId('span-bar'), { clientX: 200 });
    expect(frames).toHaveLength(1);
    frames[0](0);
    expect(update).toHaveBeenCalledTimes(1);
    expect(cursorOf(0)).toBeCloseTo(0.5);
  });
});
