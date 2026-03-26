/**
 * Kanban / Project Board Template
 */

import { registerTemplate, TEMPLATE_CSS } from "./templateRegistry";

const KANBAN_APP = `import React, { useState } from "react";
import Board from "./components/Board";
import BoardHeader from "./components/BoardHeader";

const initialColumns = [
  {
    id: "backlog",
    title: "Backlog",
    color: "var(--color-text-muted)",
    cards: [
      { id: "1", title: "Research competitor pricing", labels: ["Research"], priority: "low", assignee: "AW" },
      { id: "2", title: "Write API documentation", labels: ["Docs"], priority: "medium", assignee: "SC" },
    ],
  },
  {
    id: "todo",
    title: "To Do",
    color: "var(--color-primary)",
    cards: [
      { id: "3", title: "Design new landing page", labels: ["Design", "High Priority"], priority: "high", assignee: "TR" },
      { id: "4", title: "Set up CI/CD pipeline", labels: ["DevOps"], priority: "medium", assignee: "JW" },
      { id: "5", title: "User authentication flow", labels: ["Backend"], priority: "high", assignee: "SC" },
    ],
  },
  {
    id: "in-progress",
    title: "In Progress",
    color: "var(--color-warning)",
    cards: [
      { id: "6", title: "Implement search functionality", labels: ["Frontend"], priority: "high", assignee: "LP" },
      { id: "7", title: "Database schema migration", labels: ["Backend"], priority: "medium", assignee: "MJ" },
    ],
  },
  {
    id: "review",
    title: "In Review",
    color: "var(--color-primary)",
    cards: [
      { id: "8", title: "Payment integration", labels: ["Backend", "Critical"], priority: "high", assignee: "AW" },
    ],
  },
  {
    id: "done",
    title: "Done",
    color: "var(--color-success)",
    cards: [
      { id: "9", title: "Setup project repository", labels: ["DevOps"], priority: "low", assignee: "JW" },
      { id: "10", title: "Design system components", labels: ["Design"], priority: "medium", assignee: "TR" },
      { id: "11", title: "User research interviews", labels: ["Research"], priority: "medium", assignee: "LP" },
    ],
  },
];

export default function App() {
  const [columns, setColumns] = useState(initialColumns);

  const moveCard = (cardId, fromCol, toCol) => {
    setColumns(prev => {
      const updated = prev.map(col => ({ ...col, cards: [...col.cards] }));
      const fromColumn = updated.find(c => c.id === fromCol);
      const toColumn = updated.find(c => c.id === toCol);
      if (!fromColumn || !toColumn) return prev;
      const cardIdx = fromColumn.cards.findIndex(c => c.id === cardId);
      if (cardIdx === -1) return prev;
      const [card] = fromColumn.cards.splice(cardIdx, 1);
      toColumn.cards.push(card);
      return updated;
    });
  };

  const addCard = (colId, title) => {
    setColumns(prev => prev.map(col =>
      col.id === colId
        ? { ...col, cards: [...col.cards, { id: Date.now().toString(), title, labels: [], priority: "medium", assignee: "??" }] }
        : col
    ));
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--color-bg-secondary)]">
      <BoardHeader />
      <Board columns={columns} onMoveCard={moveCard} onAddCard={addCard} />
    </div>
  );
}`;

const BOARD_HEADER = `import React from "react";
import { Zap, Users, Filter, Search, LayoutGrid, List } from "lucide-react";

export default function BoardHeader() {
  return (
    <div className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-6 py-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--color-primary)] rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">{{APP_NAME}}</h1>
            <p className="text-xs text-[var(--color-text-muted)]">Sprint 14 · 5 days remaining</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {["SC", "TR", "MJ", "LP"].map(initials => (
              <div key={initials} className="w-7 h-7 rounded-full bg-[var(--color-primary-light)] border-2 border-white flex items-center justify-center text-xs font-medium text-[var(--color-primary)]">
                {initials}
              </div>
            ))}
            <button className="w-7 h-7 rounded-full bg-[var(--color-bg-secondary)] border-2 border-white flex items-center justify-center text-xs text-[var(--color-text-muted)]">
              +2
            </button>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <input placeholder="Search tasks..." className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" />
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)]">
          <Filter className="w-3.5 h-3.5" /> Filter
        </button>
        <div className="flex border border-[var(--color-border)] rounded-lg overflow-hidden">
          <button className="p-1.5 bg-[var(--color-primary-light)] text-[var(--color-primary)]"><LayoutGrid className="w-4 h-4" /></button>
          <button className="p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)]"><List className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}`;

const BOARD = `import React, { useState } from "react";
import { Plus, MoreHorizontal, MessageSquare, Paperclip, Clock } from "lucide-react";

const priorityColors = {
  high: "bg-[var(--color-danger)] text-white",
  medium: "bg-[var(--color-warning)] text-white",
  low: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
};

const labelColors = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-green-100 text-green-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-red-100 text-red-700",
];

function Card({ card }) {
  return (
    <div className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] p-3 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing group">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {card.labels.map((label, i) => (
          <span key={label} className={"text-[10px] px-1.5 py-0.5 rounded font-medium " + labelColors[i % labelColors.length]}>
            {label}
          </span>
        ))}
      </div>
      <p className="text-sm font-medium text-[var(--color-text)] mb-3">{card.title}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
          <div className="flex items-center gap-0.5"><MessageSquare className="w-3 h-3" /><span className="text-[10px]">3</span></div>
          <div className="flex items-center gap-0.5"><Paperclip className="w-3 h-3" /><span className="text-[10px]">1</span></div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={"w-1.5 h-1.5 rounded-full " + (card.priority === "high" ? "bg-[var(--color-danger)]" : card.priority === "medium" ? "bg-[var(--color-warning)]" : "bg-gray-300")} />
          <div className="w-6 h-6 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center text-[10px] font-medium text-[var(--color-primary)]">
            {card.assignee}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Board({ columns, onMoveCard, onAddCard }) {
  const [addingTo, setAddingTo] = useState(null);
  const [newTitle, setNewTitle] = useState("");

  const handleAdd = (colId) => {
    if (newTitle.trim()) {
      onAddCard(colId, newTitle.trim());
      setNewTitle("");
      setAddingTo(null);
    }
  };

  return (
    <div className="flex-1 overflow-x-auto p-6">
      <div className="flex gap-4 h-full">
        {columns.map(col => (
          <div key={col.id} className="w-72 flex-shrink-0 flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                <span className="text-sm font-semibold">{col.title}</span>
                <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded-full">{col.cards.length}</span>
              </div>
              <button className="p-1 rounded hover:bg-[var(--color-bg-secondary)]">
                <MoreHorizontal className="w-4 h-4 text-[var(--color-text-muted)]" />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto pb-4">
              {col.cards.map(card => (
                <Card key={card.id} card={card} />
              ))}
              {addingTo === col.id ? (
                <div className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-primary)] p-3">
                  <textarea
                    autoFocus
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(col.id); } if (e.key === "Escape") setAddingTo(null); }}
                    placeholder="Enter task title..."
                    className="w-full text-sm resize-none border-none outline-none bg-transparent"
                    rows={2}
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleAdd(col.id)} className="px-3 py-1 text-xs bg-[var(--color-primary)] text-white rounded-md hover:bg-[var(--color-primary-hover)]">Add</button>
                    <button onClick={() => setAddingTo(null)} className="px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] rounded-md">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTo(col.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add card
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}`;

registerTemplate({
  id: "kanban",
  name: "Kanban Board",
  category: "productivity",
  keywords: ["kanban", "board", "project", "task", "sprint", "agile", "scrum", "trello", "jira", "backlog"],
  description: "Kanban project board with columns, cards, labels, and priorities",
  variables: ["APP_NAME"],
  deps: { "lucide-react": "^0.400.0" },
  files: {
    "/App.jsx": KANBAN_APP,
    "/components/BoardHeader.jsx": BOARD_HEADER,
    "/components/Board.jsx": BOARD,
    "/styles.css": TEMPLATE_CSS,
  },
});
