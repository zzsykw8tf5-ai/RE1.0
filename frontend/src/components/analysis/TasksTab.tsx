import { useEffect, useState } from 'react';
import {
  Plus, X, Check, Trash2, AlertCircle, Euro,
  Calendar, User, ChevronRight, TrendingDown, Layers,
  Home, Building2, Wrench, Scale, Settings, LayoutGrid,
} from 'lucide-react';
import type { Property } from '../../types';
import type { PropertyTask, TaskMeta } from '../../types';
import { listTasks, createTask, updateTask, deleteTask } from '../../services/api';
import type { TasksResponse } from '../../services/api';
import { formatEur } from '../../utils/format';

interface Props { property: Property; }

const STATUS_ORDER = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  BACKLOG:     { bg: 'bg-gray-50',    text: 'text-gray-500',   border: 'border-gray-200' },
  TODO:        { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200' },
  IN_PROGRESS: { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200' },
  REVIEW:      { bg: 'bg-purple-50',  text: 'text-purple-700', border: 'border-purple-200' },
  DONE:        { bg: 'bg-green-50',   text: 'text-green-700',  border: 'border-green-200' },
  CANCELLED:   { bg: 'bg-red-50',     text: 'text-red-600',    border: 'border-red-200' },
};

const PRIORITY_DOT: Record<string, string> = {
  LOW:      'bg-gray-300',
  MEDIUM:   'bg-apple-blue',
  HIGH:     'bg-apple-orange',
  CRITICAL: 'bg-apple-red',
};

const CAT_STYLE: Record<string, { bg: string; text: string; icon: typeof Home }> = {
  LEASING:      { bg: 'bg-teal-100',   text: 'text-teal-700',   icon: Home },
  SALES:        { bg: 'bg-green-100',  text: 'text-green-700',  icon: TrendingDown },
  CAPEX:        { bg: 'bg-rose-100',   text: 'text-rose-700',   icon: Euro },
  CONSTRUCTION: { bg: 'bg-orange-100', text: 'text-orange-700', icon: Building2 },
  MAINTENANCE:  { bg: 'bg-amber-100',  text: 'text-amber-700',  icon: Wrench },
  LEGAL:        { bg: 'bg-purple-100', text: 'text-purple-700', icon: Scale },
  MANAGEMENT:   { bg: 'bg-blue-100',   text: 'text-blue-700',   icon: Settings },
  OTHER:        { bg: 'bg-gray-100',   text: 'text-gray-600',   icon: LayoutGrid },
};

type FormData = {
  title: string; description: string; category: string; status: string;
  priority: string; cost_estimate: string; cost_actual: string;
  due_date: string; assigned_to: string;
  area_id: string; tenant_id: string;
};

const emptyForm = (): FormData => ({
  title: '', description: '', category: 'LEASING', status: 'TODO',
  priority: 'MEDIUM', cost_estimate: '', cost_actual: '', due_date: '',
  assigned_to: '', area_id: '', tenant_id: '',
});

export default function TasksTab({ property }: Props) {
  const [meta, setMeta] = useState<TasksResponse | null>(null);
  const [tasks, setTasks] = useState<PropertyTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCat, setFilterCat] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PropertyTask | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    listTasks(property.id).then(r => {
      setMeta(r);
      setTasks(r.tasks);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [property.id]);

  const openCreate = (defaults: Partial<FormData> = {}) => {
    setEditingTask(null);
    setForm({ ...emptyForm(), ...defaults });
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (t: PropertyTask) => {
    setEditingTask(t);
    setForm({
      title: t.title, description: t.description ?? '',
      category: t.category, status: t.status, priority: t.priority,
      cost_estimate: t.cost_estimate != null ? String(t.cost_estimate) : '',
      cost_actual: t.cost_actual != null ? String(t.cost_actual) : '',
      due_date: t.due_date ?? '', assigned_to: t.assigned_to ?? '',
      area_id: t.area_id != null ? String(t.area_id) : '',
      tenant_id: t.tenant_id != null ? String(t.tenant_id) : '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setFormError('Titel ist erforderlich'); return; }
    setSaving(true); setFormError('');
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || undefined,
        category: form.category, status: form.status, priority: form.priority,
        cost_estimate: form.cost_estimate ? Number(form.cost_estimate) : null,
        cost_actual: form.cost_actual ? Number(form.cost_actual) : null,
        due_date: form.due_date || null,
        assigned_to: form.assigned_to || null,
        area_id: form.area_id ? Number(form.area_id) : null,
        tenant_id: form.tenant_id ? Number(form.tenant_id) : null,
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

  const applyTemplate = (tpl: { title: string; priority: string }) => {
    setForm(f => ({ ...f, title: tpl.title, priority: tpl.priority }));
  };

  // filtered view
  const filtered = tasks.filter(t =>
    (filterCat === 'ALL' || t.category === filterCat) &&
    (filterStatus === 'ALL' || t.status === filterStatus)
  );

  // Summary counts per status
  const statusCounts = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = tasks.filter(t => t.status === s).length;
    return acc;
  }, {});

  // CapEx summary
  const capexTasks = tasks.filter(t => t.category === 'CAPEX' || t.category === 'CONSTRUCTION');
  const capexPlanned = capexTasks.reduce((s, t) => s + (t.cost_estimate ?? 0), 0);
  const capexActual = capexTasks.reduce((s, t) => s + (t.cost_actual ?? 0), 0);

  if (loading) return <div className="text-sm text-apple-text-tertiary py-8 text-center">Lädt…</div>;

  const categories = meta?.categories ?? [];
  const statuses   = meta?.statuses ?? [];
  const priorities = meta?.priorities ?? [];
  const templates  = meta?.templates ?? {};
  const areas      = meta?.areas ?? [];
  const tenants    = meta?.tenants ?? [];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {STATUS_ORDER.map(s => {
          const ss = STATUS_STYLE[s] ?? STATUS_STYLE.BACKLOG;
          const lbl = statuses.find(x => x.key === s)?.label ?? s;
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'ALL' : s)}
              className={`rounded-apple border p-2 text-center transition-all ${ss.bg} ${ss.border} ${filterStatus === s ? 'ring-2 ring-apple-blue' : ''}`}>
              <div className={`text-xl font-bold ${ss.text}`}>{statusCounts[s] ?? 0}</div>
              <div className={`text-[10px] ${ss.text} mt-0.5`}>{lbl}</div>
            </button>
          );
        })}
        {capexTasks.length > 0 && (
          <div className="rounded-apple border border-rose-200 bg-rose-50 p-2 text-center sm:col-span-2 lg:col-span-2">
            <div className="text-xs font-semibold text-rose-700">CapEx/Bau geplant</div>
            <div className="text-base font-bold text-rose-800 mt-0.5">{formatEur(capexPlanned)}</div>
            {capexActual > 0 && <div className="text-[10px] text-rose-600">tats. {formatEur(capexActual)}</div>}
          </div>
        )}
      </div>

      {/* Category quick-create shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {categories.map(c => {
          const cs = CAT_STYLE[c.key] ?? CAT_STYLE.OTHER;
          const Icon = cs.icon;
          const catCount = tasks.filter(t => t.category === c.key).length;
          return (
            <button key={c.key}
              onClick={() => openCreate({ category: c.key })}
              className={`flex items-center gap-2 px-3 py-2 rounded-apple border text-left text-xs font-medium transition-all hover:shadow-sm ${cs.bg} ${cs.text} border-current/20`}>
              <Icon size={13} className="flex-shrink-0" />
              <span className="flex-1 truncate">{c.label}</span>
              {catCount > 0 && <span className="font-bold">{catCount}</span>}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setFilterCat('ALL')}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterCat === 'ALL' ? 'bg-apple-blue text-white border-apple-blue' : 'bg-white text-apple-text-secondary border-apple-gray-3 hover:border-apple-blue'}`}>
            Alle
          </button>
          {categories.map(c => (
            <button key={c.key} onClick={() => setFilterCat(filterCat === c.key ? 'ALL' : c.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterCat === c.key ? 'bg-apple-blue text-white border-apple-blue' : 'bg-white text-apple-text-secondary border-apple-gray-3 hover:border-apple-blue'}`}>
              {c.label}
            </button>
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
          <button onClick={() => openCreate()} className="btn-primary flex items-center gap-1.5 text-xs">
            <Plus size={13} /> Aufgabe
          </button>
        </div>
      </div>

      {/* Board / List */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <AlertCircle size={28} className="text-apple-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-apple-text-secondary mb-3">Keine Aufgaben gefunden.</p>
          <button onClick={() => openCreate()} className="btn-primary text-xs">Erste Aufgabe anlegen</button>
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanBoard tasks={filtered} statuses={statuses}
          onEdit={openEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} />
      ) : (
        <ListView tasks={filtered} statuses={statuses}
          onEdit={openEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} />
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

            <div className="flex-1 px-6 py-4 space-y-4 overflow-y-auto">
              {/* Category + templates */}
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Kategorie</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {categories.map(c => {
                    const cs = CAT_STYLE[c.key] ?? CAT_STYLE.OTHER;
                    const Icon = cs.icon;
                    return (
                      <button key={c.key} type="button"
                        onClick={() => setForm(f => ({ ...f, category: c.key, title: '' }))}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-apple border text-xs transition-all ${
                          form.category === c.key
                            ? `${cs.bg} ${cs.text} border-current/30 font-semibold ring-1 ring-apple-blue`
                            : 'bg-white text-apple-text-secondary border-apple-gray-3 hover:border-apple-blue'
                        }`}>
                        <Icon size={11} />{c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Template picker */}
              {templates[form.category] && templates[form.category].length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">
                    Vorlage auswählen <span className="text-apple-text-tertiary font-normal">(optional)</span>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {templates[form.category].map((tpl, i) => (
                      <button key={i} type="button"
                        onClick={() => applyTemplate(tpl)}
                        className="text-[11px] px-2 py-1 rounded-full bg-apple-gray border border-apple-gray-3 text-apple-text-secondary hover:bg-apple-blue hover:text-white hover:border-apple-blue transition-colors">
                        {tpl.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Titel *</label>
                <input
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 bg-white"
                  value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="z.B. Exposé erstellen" autoFocus />
              </div>

              {/* Status + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">Status</label>
                  <select className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                    value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">Priorität</label>
                  <select className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                    value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    {priorities.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Area + Tenant links */}
              <div className="grid grid-cols-2 gap-3">
                {areas.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-apple-text-secondary mb-1">
                      <Layers size={10} className="inline mr-1" />Fläche
                    </label>
                    <select className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                      value={form.area_id} onChange={e => setForm(f => ({ ...f, area_id: e.target.value }))}>
                      <option value="">– keine –</option>
                      {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
                {tenants.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-apple-text-secondary mb-1">
                      <User size={10} className="inline mr-1" />Mieter
                    </label>
                    <select className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                      value={form.tenant_id} onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))}>
                      <option value="">– keiner –</option>
                      {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Costs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">Kosten geplant (€)</label>
                  <input type="number" min="0"
                    className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                    value={form.cost_estimate} onChange={e => setForm(f => ({ ...f, cost_estimate: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-apple-text-secondary mb-1">Kosten tatsächlich (€)</label>
                  <input type="number" min="0"
                    className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white"
                    value={form.cost_actual} onChange={e => setForm(f => ({ ...f, cost_actual: e.target.value }))} placeholder="0" />
                </div>
              </div>

              {/* Due date + Assignee */}
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
                    value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="Name / Team" />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-apple-text-secondary mb-1">Notizen</label>
                <textarea rows={2}
                  className="w-full px-3 py-2 rounded-apple border border-apple-gray-3 text-sm focus:outline-none focus:border-apple-blue bg-white resize-none"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Details…" />
              </div>

              {formError && <p className="text-xs text-apple-red">{formError}</p>}
            </div>

            <div className="px-6 py-4 border-t border-apple-gray-2 flex gap-2 justify-end">
              <button onClick={() => setFormOpen(false)} className="btn-secondary text-sm">Abbrechen</button>
              <button onClick={handleSave} disabled={saving}
                className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50">
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
  tasks: PropertyTask[]; statuses: TaskMeta[];
  onEdit: (t: PropertyTask) => void; onDelete: (id: number) => void;
  onStatusChange: (t: PropertyTask, s: string) => void;
}) {
  const cols = statuses.filter(s => STATUS_ORDER.includes(s.key));
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
      {cols.map(col => {
        const ss = STATUS_STYLE[col.key] ?? STATUS_STYLE.BACKLOG;
        const colTasks = tasks.filter(t => t.status === col.key);
        return (
          <div key={col.key} className="flex-shrink-0 w-60 md:w-68">
            <div className={`flex items-center justify-between px-3 py-2 rounded-lg mb-2 border text-xs font-semibold ${ss.bg} ${ss.border} ${ss.text}`}>
              <span>{col.label}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-white/70 font-bold">{colTasks.length}</span>
            </div>
            <div className="space-y-2 min-h-12">
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
  tasks: PropertyTask[]; statuses: TaskMeta[];
  onEdit: (t: PropertyTask) => void; onDelete: (id: number) => void;
  onStatusChange: (t: PropertyTask, s: string) => void;
}) {
  const grouped = STATUS_ORDER.map(sk => ({
    st: statuses.find(s => s.key === sk),
    tasks: tasks.filter(t => t.status === sk),
  })).filter(g => g.tasks.length > 0 && g.st);

  return (
    <div className="space-y-4">
      {grouped.map(g => {
        const ss = STATUS_STYLE[g.st!.key] ?? STATUS_STYLE.BACKLOG;
        return (
          <div key={g.st!.key}>
            <div className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full mb-2 border ${ss.bg} ${ss.border} ${ss.text}`}>
              {g.st!.label} <span>({g.tasks.length})</span>
            </div>
            <div className="space-y-1.5">
              {g.tasks.map(t => (
                <TaskCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} list />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onEdit, onDelete, onStatusChange, list }: {
  task: PropertyTask; onEdit: (t: PropertyTask) => void;
  onDelete: (id: number) => void; onStatusChange: (t: PropertyTask, s: string) => void;
  list?: boolean;
}) {
  const cs = CAT_STYLE[task.category] ?? CAT_STYLE.OTHER;
  const CatIcon = cs.icon;
  const isOverdue = task.due_date && task.status !== 'DONE' && new Date(task.due_date) < new Date();

  return (
    <div className={`bg-white border border-apple-gray-2 rounded-apple p-3 hover:shadow-md transition-shadow group cursor-pointer ${list ? 'flex items-start gap-3' : ''}`}
      onClick={() => onEdit(task)}>
      <div className={`w-1.5 rounded-full flex-shrink-0 self-stretch ${PRIORITY_DOT[task.priority] ?? 'bg-gray-300'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-medium text-apple-text leading-tight">{task.title}</p>
          <button onClick={e => { e.stopPropagation(); onDelete(task.id); }}
            className="p-1 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
            <Trash2 size={11} className="text-apple-red" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-0.5 ${cs.bg} ${cs.text}`}>
            <CatIcon size={9} />{task.category_label}
          </span>
          {task.area_name && (
            <span className="text-[10px] text-apple-text-tertiary inline-flex items-center gap-0.5">
              <Layers size={9} />{task.area_name}
            </span>
          )}
          {task.tenant_name && (
            <span className="text-[10px] text-apple-text-tertiary inline-flex items-center gap-0.5">
              <User size={9} />{task.tenant_name}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-1 items-center">
          {task.cost_estimate != null && (
            <span className="text-[10px] text-apple-text-secondary">
              {formatEur(task.cost_estimate)} geplant
            </span>
          )}
          {task.due_date && (
            <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? 'text-apple-red font-semibold' : 'text-apple-text-tertiary'}`}>
              <Calendar size={9} />{new Date(task.due_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            </span>
          )}
          {task.assigned_to && (
            <span className="text-[10px] text-apple-text-tertiary flex items-center gap-0.5">
              <User size={9} />{task.assigned_to}
            </span>
          )}
        </div>

        {/* Quick status advance */}
        {task.status !== 'DONE' && task.status !== 'CANCELLED' && (() => {
          const idx = STATUS_ORDER.indexOf(task.status);
          if (idx < 0 || idx >= STATUS_ORDER.length - 1) return null;
          return (
            <button onClick={e => { e.stopPropagation(); onStatusChange(task, STATUS_ORDER[idx + 1]); }}
              className="mt-1.5 text-[10px] text-apple-blue hover:underline flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              Weiter <ChevronRight size={9} />
            </button>
          );
        })()}
      </div>
    </div>
  );
}
