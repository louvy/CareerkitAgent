'use client';

import * as React from 'react';
import { DragOverlay as DndDragOverlay } from '@dnd-kit/core';

interface DragOverlayProps {
  children: React.ReactNode;
}

export function DragOverlay({ children }: DragOverlayProps) {
  return <DndDragOverlay>{children}</DndDragOverlay>;
}
