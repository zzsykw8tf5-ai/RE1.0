import { useEffect, useState } from 'react';
import {
  Plus, X, Check, Trash2, Pencil, AlertCircle, Euro,
  Calendar, User, Tag, ChevronRight, TrendingDown,
} from 'lucide-react';
import type { Property } from '../../types';
import type { PropertyTask, TaskMeta } from '../../types';
import { listTasks, createTask, updateTask, deleteTask } from '../../services/api';
import { formatEur } from '../../utils/format';

interface Props { property: Property; }

const STATUS_ORDER = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
const STATUS_COLORS: Record<string, string> = {
  BACKLOG:     'bg-gray-100 text-gray-600 border-gray-200',
  TODO:        'bg-blue-100 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 border-amber-200',
  REVIEW:      'bg-purple-100 text-purple-700 border-purple-200',
  DONE:        'bg-green-100 text-green-700 border-green-200',
  CANCELLED:   'bg-red-100 text-red-600 border-red-200',
};
const PRIORITY_DOT: Record<string, string> = {
  LOW:      'bg-gray-300',
  MEDIUM:   'bg-apple-blue',
  HIGH:     'bg-apple-orange',
  CRITICAL: 'bg-apple-red',
};
const CATEGORY_COLORS: Record<string, string> = {
  CAPEX:       'bg-rose-100 text-rose-700',
  MAINTENANCE: 'bg-amber-100 text-amber-700',
  SALES:       'bg-green-100 text-green-700',
  LEGAL:       'bg-purple-100 text-purple-700',
  MANAGEMENT:  'bg-blue-100 text-blue-700',
  OTHER:       'bg-gray-100 text-gray-600',
};

type FormData = {
  title: string; description: string; category: string; status: string;
  priority: string; cost_estimate: string; cost_actual: string;
  due_date: string; assigned_to: string;
};

const emptyForm = (): FormData => ({
  title: '', description: '', category: 'OTHER', status: 'TODO',
  priority: 'MEDIUM', cost_estimate: '', cost_actual: '', due_date: '', assigned_to: '',
});

export default function TasksTab({ property }: Props) {
  const [tasks, setTasks] = useState<PropertyTask[]>([]);
  const [categories, setCategories] = useState<TaskMeta[]>([]);
  const [statuses, setStatuses] = useState<TaskMeta[]>([]);
  const [priorities, setPriorities] = useState<TaskMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCat, setFilterCat] = useState('ALL');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PropertyTask | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    listTasks(property.id).then(r => {
      setTasks(r.tasks);
      setCategories(r.categories);
      setStatuses(r.statuses);
      setPriorities(r.priorities);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [property.id]);

  const openCreate = () => {
    setEditingTask(null);
    setForm(emptyForm());
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (t: PropertyTask) => {
    setEditingTask(t);
    setForm({
      title: t.title,
      description: t.description ?? '',
      category: t.category,
      status: t.status,
      priority: t.priority,
      cost_estimate: t.cost_estimate != null ? String(t.cost_estimate) : '',
      cost_actual: t.cost_actual != null ? String(t.cost_actual) : '',
      due_date: t.due_date ?? '',
      assigned_to: t.assigned_to ?? '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setFormError('Titel ist erforderlich'); return; }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || undefined,
        category: form.category,
        status: form.status,
        priority: form.priority,
        cost_estimate: form.cost_estimate ? Number(form.cost_estimate) : null,
        cost_actual: form.cost_actual ? Number(form.cost_actual) : null,
        due_date: form.due_date || null,
        assigned_to: form.assigned_to || null,
      };
      if (editingTask) {
        const updated = await updateTask(property.id, editingTask.id, payload);
        setTasks(ts => ts.map(t => t.id === updated.id ? updated : t));
      } else {
        const created = await createTask(property.id, payload);
        setTasks(ts => [created, ...ts]);
      }
      setFormOpen(false);
    } catch { setFormError('Speichern fehlgeschlagen'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (taskId: number) => {
    if (!window.confirm('Aufgabe wirklich löschen?')) return;
    await deleteTask(property.id, taskId);
    setTasks(ts => ts.filter(t => t.id !== taskId));
  };

  const handleStatusChange = async (task: PropertyTask, newStatus: string) => {
    const updated = await updateTask(property.id, task.id, { status: newStatus });
    setTasks(ts => ts.map(t => t.id === updated.id ? updated : t));
  };

  const filtered = tasks.filter(t => filterCat === 'ALL' || t.category === filterCat);

  // CapEx summary
  const capexTasks = tasks.filter(t => t.category === 'CAPEX');
  const capexPlanned = capexTasks.reduce((s, t) => s + (t.cost_estimate ?? 0), 0);
  const capexActual = capexTasks.reduce((s, t) => s + (t.cost_actual ?? 0), 0);
  const capexDone = capexTasks.filter(t => t.status === 'DONE').reduce((s, t) => s + (t.cost_actual ?? t.cost_estimate ?? 0), 0);

  if (loading) return <div className="text-sm text-apple-text-tertiary py-8 text-center">Lädt…</div>;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* CapEx summary */}
      {capexTasks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'CapEx geplant', val: formatEur(capexPlanned), icon: TrendingDown, color: 'text-rose-600' },
            { label: 'CapEx tatsächlich', val: formatEur(capexActual), icon: Euro, color: 'text-apple-orange' },
            { label: 'Bereits umgesetzt', val: formatEur(capexDone), icon: Check, color: 'text-apple-green' },
            { label: 'CapEx Maßnahmen', val: String(capexTasks.length), icon: Tag, color: 'text-apple-blue' },
          ].map(k => (
            <div key={k.label} className="card p-3 text-center">
              <k.icon size={14} className={`${k.color} mx-auto mb-1`} />
              <div className="text-base font-bold text-apple-text">{k.val}</div>
              <div className="text-[10px] text-apple-text-tertiary uppercase tracking-wide mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[{ key: 'ALL', label: 'Alle' }, ...categories].map(c => (
            <button
              key={c.key}
              onClick={() => setFilterCat(c.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filterCat === c.key
                  ? 'bg-apple-blue text-white border-apple-blue'
                  : 'bg-white text-apple-text-secondary border-apple-gray-3 hover:border-apple-blue'
              }`}
            >{c.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-apple border border-apple-gray-3 overflow-hidden text-xs">
            {(['kanban', 'list'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 ${viewMode === m ? 'bg-apple-blue text-white' : 'text-apple-text-secondary hover:bg-apple-gray'}`}>
                {m === 'kanban' ? 'Board' : 'Liste'}
              </button>
            ))}
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-xs">
            <Plus size={13} /> Aufgabe
          </button>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <AlertCircle size={28} className="text-apple-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-apple-text-secondary">Noch keine Aufgaben angelegt.</p>
          <button onClick={openCreate} className="btn-primary mt-3 text-xs">Erste Aufgabe anlegen</button>
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanBoard
          tasks={filtered} statuses={statuses}
          onEdit={openEdit} onDelete={handleDelete} onStatusChange={handleStatusChange}
        />
      ) : (
        <ListView tasks={filtered} onEdit={openEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} statuses={statuses} />
      )}

      {/* Slide-over form */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setFormOpen(false)} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-apple-gray-2">
              <h2 className="text-base font-semibold text-apple-text">
                {editingTask ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
              </h2>
              <button onClick={() => setFormOpen(false)} className="p-1.5 hover:bg-apple-gray-2 rounded-lg"><X size={16} /></button>
            </div>
            <div className="flex-1 px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Titel *</label>
                <input
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                  value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="z.B. Dachsanierung 2025"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">Kategorie</label>
                  <select className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                    value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">Status</label>
                  <select className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                    value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Priorität</label>
                <div className="flex gap-2">
                  {priorities.map(p => (
                    <button key={p.key} type="button"
                      onClick={() => setForm(f => ({ ...f, priority: p.key }))}
                      className={`flex-1 py-1.5 text-xs rounded-apple border transition-colors ${
                        form.priority === p.key
                          ? 'border-apple-blue bg-apple-blue text-white font-medium'
                          : 'border-apple-gray-3 text-apple-text-secondary hover:border-apple-blue'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">Kosten geplant (€)</label>
                  <input type="number" min="0"
                    className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                    value={form.cost_estimate} onChange={e => setForm(f => ({ ...f, cost_estimate: e.target.value }))}
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">Kosten tatsächlich (€)</label>
                  <input type="number" min="0"
                    className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                    value={form.cost_actual} onChange={e => setForm(f => ({ ...f, cost_actual: e.target.value }))}
                    placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">Fällig am</label>
                  <input type="date"
                    className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                    value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">Zugewiesen an</label>
                  <input
                    className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                    value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                    placeholder="Name / Team" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Beschreibung</label>
                <textarea rows={3}
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white resize-none"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Details zur Maßnahme…" />
              </div>
              {formError && <p className="text-xs text-apple-red">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-apple-gray-2 flex gap-2 justify-end">
              <button onClick={() => setFormOpen(false)} className="btn-secondary text-sm">Abbrechen</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50">
                <Check size={14} />{saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kanban Board ──────────────────────────────────────────────────────────────

function KanbanBoard({ tasks, statuses, onEdit, onDelete, onStatusChange }: {
  tasks: PropertyTask[];
  statuses: TaskMeta[];
  onEdit: (t: PropertyTask) => void;
  onDelete: (id: number) => void;
  onStatusChange: (t: PropertyTask, s: string) => void;
}) {
  const visibleStatuses = statuses.filter(s => STATUS_ORDER.includes(s.key));
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {visibleStatuses.map(col => {
        const colTasks = tasks.filter(t => t.status === col.key);
        return (
          <div key={col.key} className="flex-shrink-0 w-64 md:w-72">
            <div className={`flex items-center justify-between px-3 py-2 rounded-apple-lg mb-2 border text-xs font-semibold ${STATUS_COLORS[col.key] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              <span>{col.label}</span>
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-white/60 font-bold">{colTasks.length}</span>
            </div>
            <div className="space-y-2 min-h-16">
              {colTasks.map(t => (
                <TaskCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── List View ─────────────────────────────────────────────────────────────────

function ListView({ tasks, statuses, onEdit, onDelete, onStatusChange }: {
  tasks: PropertyTask[];
  statuses: TaskMeta[];
  onEdit: (t: PropertyTask) => void;
  onDelete: (id: number) => void;
  onStatusChange: (t: PropertyTask, s: string) => void;
}) {
  const grouped = STATUS_ORDER.map(sk => ({
    status: statuses.find(s => s.key === sk),
    tasks: tasks.filter(t => t.status === sk),
  })).filter(g => g.tasks.length > 0 && g.status);

  return (
    <div className="space-y-4">
      {grouped.map(g => (
        <div key={g.status!.key}>
          <div className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full mb-2 border ${STATUS_COLORS[g.status!.key]}`}>
            {g.status!.label} <span>({g.tasks.length})</span>
          </div>
          <div className="space-y-2">
            {g.tasks.map(t => (
              <TaskCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} list />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onEdit, onDelete, onStatusChange, list }: {
  task: PropertyTask;
  onEdit: (t: PropertyTask) => void;
  onDelete: (id: number) => void;
  onStatusChange: (t: PropertyTask, s: string) => void;
  list?: boolean;
}) {
  const isOverdue = task.due_date && task.status !== 'DONE' && new Date(task.due_date) < new Date();
  return (
    <div className={`bg-white border border-apple-gray-2 rounded-apple p-3 hover:shadow-apple transition-shadow group ${list ? 'flex items-start gap-3' : ''}`}>
      {/* Priority dot */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${PRIORITY_DOT[task.priority] ?? 'bg-gray-300'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-medium text-apple-text leading-tight">{task.title}</p>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={() => onEdit(task)} className="p-1 hover:bg-apple-gray-2 rounded"><Pencil size={11} className="text-apple-text-secondary" /></button>
            <button onClick={() => onDelete(task.id)} className="p-1 hover:bg-red-50 rounded"><Trash2 size={11} className="text-apple-red" /></button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[task.category] ?? 'bg-gray-100 text-gray-600'}`}>
            {task.category_label}
          </span>
          {task.cost_estimate != null && (
            <span className="text-[10px] text-apple-text-tertiary flex items-center gap-0.5">
              <Euro size={9} />{(task.cost_estimate / 1000).toFixed(0)}k geplant
            </span>
          )}
          {task.due_date && (
            <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? 'text-apple-red font-medium' : 'text-apple-text-tertiary'}`}>
              <Calendar size={9} />{new Date(task.due_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
            </span>
          )}
          {task.assigned_to && (
            <span className="text-[10px] text-apple-text-tertiary flex items-center gap-0.5">
              <User size={9} />{task.assigned_to}
            </span>
          )}
        </div>
        {/* Quick status advance */}
        {task.status !== 'DONE' && task.status !== 'CANCELLED' && (
          <button
            onClick={() => {
              const idx = STATUS_ORDER.indexOf(task.status);
              if (idx < STATUS_ORDER.length - 1) onStatusChange(task, STATUS_ORDER[idx + 1]);
            }}
            className="mt-2 text-[10px] text-apple-blue hover:underline flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Weiter <ChevronRight size={9} />
          </button>
        )}
      </div>
    </div>
  );
}
