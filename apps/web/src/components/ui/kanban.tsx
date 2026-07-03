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
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { MoreVertical, Plus, Pencil } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface KanbanDndState {
  activeId: string | null;
  activeColumnId: string | null;
}

const KanbanContext = React.createContext<KanbanDndState>({ activeId: null, activeColumnId: null });

const announcements: Announcements = {
  onDragStart({ active }) {
    return `Picked up task ${active.id}. Use arrow keys to move, space to drop, escape to cancel.`;
  },
  onDragOver({ active, over }) {
    if (over) {
      return `Task ${active.id} is now over ${over.id}.`;
    }
    return `Task ${active.id} is no longer over a drop target.`;
  },
  onDragEnd({ active, over }) {
    if (over) {
      return `Task ${active.id} was dropped onto ${over.id}.`;
    }
    return `Task ${active.id} was dropped.`;
  },
  onDragCancel({ active }) {
    return `Dragging cancelled. Task ${active.id} returned to its original position.`;
  },
};

const screenReaderInstructions = {
  draggable:
    'To pick up a draggable card, press space. While dragging, use arrow keys to move. Press space to drop, or escape to cancel.',
};

export const INTERACTIVE_SELECTOR =
  ':is(button, [role="button"], [role="menuitem"], [role="checkbox"], a, input, select, textarea, [data-card-no-click])';

export function NoCardClick({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <span
      data-card-no-click
      className={className}
      onClick={stop}
      onPointerDown={stop}
      onKeyDown={stop}
      style={{ display: 'contents' }}
    >
      {children}
    </span>
  );
}

export type KanbanMoveHandler = (
  taskId: string,
  fromColumnId: string,
  toColumnId: string,
  fromIndex: number,
  toIndex: number,
) => void;

export interface KanbanProps {
  onMove: KanbanMoveHandler;
  /** Optional renderer for the dragged card inside <DragOverlay>. Receives the active taskId. */
  renderOverlay?: (taskId: string) => React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Kanban({ onMove, renderOverlay, className, children }: KanbanProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = React.useState<string | null>(null);
  const activeRef = React.useRef<HTMLElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
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
    const fromColumnId = String(
      (active.data.current as { columnId?: string } | undefined)?.columnId ?? '',
    );
    if (!fromColumnId) return;

    let toIndex = 0;

    const overData = over.data.current as
      | { columnId?: string; index?: number; type?: string }
      | undefined;

    let toColumnId: string;
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
        accessibility={{ announcements, screenReaderInstructions }}
      >
        <div
          className={cn(
            'kanban-scroll flex h-full flex-1 gap-3 overflow-x-auto px-4 py-4',
            className,
          )}
        >
          {children}
        </div>
        <DragOverlay dropAnimation={{ duration: 120, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          {activeId ? (
            renderOverlay ? (
              <div className="pointer-events-none w-[272px] rotate-1 shadow-2xl">
                {renderOverlay(activeId)}
              </div>
            ) : (
              <div className="kanban-drag-overlay pointer-events-none w-[272px] rotate-1 rounded-lg border border-primary/60 bg-card p-3 shadow-2xl">
                <span className="text-xs text-muted-foreground">Moving…</span>
              </div>
            )
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
  /** When provided, renders a column kebab menu with "Add task". */
  onAddTask?: () => void;
  /** When provided, the column kebab menu includes "Rename column". */
  onRenameColumn?: (newName: string) => void;
}

export function KanbanColumn({
  id,
  name,
  count,
  children,
  className,
  onAddTask,
  onRenameColumn,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${id}`,
    data: { type: 'column', columnId: id },
  });
  const childArray = React.Children.toArray(children).filter(Boolean);
  const showMenu = Boolean(onAddTask || onRenameColumn);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(name);

  const submitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== name && onRenameColumn) {
      onRenameColumn(trimmed);
    }
    setIsRenaming(false);
  };

  return (
    <section
      ref={setNodeRef}
      data-column-id={id}
      className={cn(
        'flex w-72 flex-shrink-0 flex-col rounded-xl border bg-card/80 backdrop-blur-sm',
        'border-border',
        isOver && 'kanban-column-over',
        className,
      )}
      aria-label={`Column ${name}`}
    >
      <header className="flex items-center justify-between px-3 py-2.5">
        {isRenaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitRename();
              } else if (e.key === 'Escape') {
                setRenameValue(name);
                setIsRenaming(false);
              }
            }}
            className="h-7 text-sm"
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium tracking-tight">{name}</span>
            {typeof count === 'number' && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                {count}
              </span>
            )}
          </div>
        )}
        {showMenu && !isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-no-drag
                onPointerDown={(e) => e.stopPropagation()}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Column ${name} menu`}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
              {onAddTask && (
                <DropdownMenuItem onSelect={() => onAddTask()}>
                  <Plus className="h-3.5 w-3.5" />
                  Add task
                </DropdownMenuItem>
              )}
              {onRenameColumn && (
                <DropdownMenuItem
                  onSelect={() => {
                    setRenameValue(name);
                    setIsRenaming(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename column
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2 pt-1">
        {childArray.length === 0 ? (
          <div
            className={cn(
              'rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground transition-colors',
              isOver && 'border-primary text-primary',
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

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest(INTERACTIVE_SELECTOR)) {
      e.stopPropagation();
      return;
    }
    listeners?.onPointerDown?.(e);
  };

  return (
    <div
      ref={setNodeRef}
      data-kanban-id={id}
      className={cn(
        'cursor-grab select-none touch-none transition-opacity duration-150',
        isDragging && 'opacity-30',
        isOtherDragging && activeColumnId !== columnId && 'opacity-60',
        className,
      )}
    >
      <div {...listeners} {...attributes} onPointerDown={onPointerDown}>
        {children}
      </div>
    </div>
  );
}
