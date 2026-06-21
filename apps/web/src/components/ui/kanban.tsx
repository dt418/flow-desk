/**
 * FlowDesk Kanban — Jira/Trello-style DnD on @dnd-kit.
 *
 * Public API:
 *   <Kanban onMove={(taskId, fromColumnId, toColumnId, fromIndex, toIndex) => void}>
 *     {columns.map(c => (
 *       <KanbanColumn key={c.id} id={c.id} name={c.name} count={c.tasks.length}>
 *         {c.tasks.map((t, i) => (
 *           <KanbanCard key={t.id} id={t.id} columnId={c.id} index={i} ...>
 *             ...your card markup...
 *           </KanbanCard>
 *         ))}
 *       </KanbanColumn>
 *     ))}
 *   </Kanban>
 *
 * Columns and tasks are passed as children (not as props) so consumers can
 * render any card layout (avatar, labels, due date, etc).
 */
import * as React from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { cn } from '@/lib/utils';

interface KanbanDndState {
  activeId: string | null;
  activeColumnId: string | null;
}

const KanbanContext = React.createContext<KanbanDndState>({ activeId: null, activeColumnId: null });

export type KanbanMoveHandler = (
  taskId: string,
  fromColumnId: string,
  toColumnId: string,
  fromIndex: number,
  toIndex: number,
) => void;

export interface KanbanProps {
  onMove: KanbanMoveHandler;
  className?: string;
  children: React.ReactNode;
}

export function Kanban({ onMove, className, children }: KanbanProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = React.useState<string | null>(null);
  const activeRef = React.useRef<HTMLElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6, delay: 80 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);
    const data = event.active.data.current as { columnId?: string } | undefined;
    setActiveColumnId(data?.columnId ?? null);
    activeRef.current = event.active.rect.current.translated?.top
      ? (document.querySelector(`[data-kanban-id="${id}"]`) as HTMLElement | null)
      : null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setActiveColumnId(null);
    activeRef.current = null;
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const overId = String(over.id);
    const fromColumnId = String((active.data.current as { columnId?: string } | undefined)?.columnId ?? '');
    if (!fromColumnId) return;

    let toColumnId: string | null = null;
    let toIndex = 0;

    const overData = over.data.current as { columnId?: string; index?: number; type?: string } | undefined;
    if (overData?.type === 'column' && typeof overData.columnId === 'string') {
      toColumnId = overData.columnId;
      toIndex = Number.MAX_SAFE_INTEGER;
    } else if (typeof overData?.columnId === 'string') {
      toColumnId = overData.columnId;
      toIndex = overData.index ?? 0;
    } else {
      // dropped onto a column wrapper by id
      toColumnId = overId.startsWith('column:') ? overId.slice('column:'.length) : overId;
    }
    if (!toColumnId) return;

    const fromIndex = Number((active.data.current as { index?: number } | undefined)?.index ?? 0);
    onMove(taskId, fromColumnId, toColumnId, fromIndex, toIndex);
  };

  return (
    <KanbanContext.Provider value={{ activeId, activeColumnId }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setActiveColumnId(null);
        }}
      >
        <div className={cn('kanban-scroll flex h-full flex-1 gap-3 overflow-x-auto px-4 py-4', className)}>
          {children}
        </div>
        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          {activeId ? (
            <div className="kanban-drag-overlay pointer-events-none w-[272px] rotate-1 rounded-lg border border-emerald-500/60 bg-[var(--bg)] p-3 shadow-2xl">
              <span className="caption">Moving…</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </KanbanContext.Provider>
  );
}

export interface KanbanColumnProps {
  id: string;
  name: string;
  count?: number;
  children: React.ReactNode;
  className?: string;
}

export function KanbanColumn({ id, name, count, children, className }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${id}`,
    data: { type: 'column', columnId: id },
  });
  const childArray = React.Children.toArray(children).filter(Boolean);
  return (
    <section
      ref={setNodeRef}
      data-column-id={id}
      className={cn(
        'flex w-72 flex-shrink-0 flex-col rounded-xl border bg-[var(--bg-2)]/80 backdrop-blur-sm',
        'border-[var(--border)]',
        isOver && 'kanban-column-over',
        className,
      )}
      aria-label={`Column ${name}`}
    >
      <header className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium tracking-tight">{name}</span>
          {typeof count === 'number' && (
            <span className="rounded-md bg-[var(--bg-3)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--fg-2)]">
              {count}
            </span>
          )}
        </div>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2 pt-1">
        {childArray.length === 0 ? (
          <div
            className={cn(
              'rounded-lg border border-dashed border-[var(--border)] px-3 py-8 text-center text-[12px] text-[var(--fg-3)] transition-colors',
              isOver && 'border-emerald-500 text-emerald-600',
            )}
          >
            {isOver ? 'Drop here' : 'No tasks'}
          </div>
        ) : (
          childArray
        )}
      </div>
    </section>
  );
}

export interface KanbanCardProps {
  id: string;
  columnId: string;
  index: number;
  children: React.ReactNode;
  className?: string;
}

export function KanbanCard({ id, columnId, index, children, className }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type: 'task', columnId, index },
  });
  const { activeId, activeColumnId } = React.useContext(KanbanContext);
  const isOtherDragging = activeId !== null && activeId !== id;
  return (
    <div
      ref={setNodeRef}
      data-kanban-id={id}
      {...attributes}
      {...listeners}
      className={cn(
        'cursor-grab select-none touch-none',
        isDragging && 'opacity-30',
        isOtherDragging && activeColumnId !== columnId && 'opacity-60',
        className,
      )}
    >
      {children}
    </div>
  );
}
