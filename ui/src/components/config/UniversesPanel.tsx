import { useState } from 'react'
import type { UniverseConfig, StatusMessage } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pencil, Trash2, Plus, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UniversesPanelProps {
  universes: Record<string, UniverseConfig>
  status: StatusMessage | null
  onChange: (universes: Record<string, UniverseConfig>) => void
  onSave: (universes: Record<string, UniverseConfig>) => Promise<void>
}

interface EditState {
  id: string
  device_ip: string
  label: string
}

interface AddState {
  id: string
  device_ip: string
  label: string
  type: 'wled' | 'gateway'
}

export function UniversesPanel({ universes, status, onChange, onSave }: UniversesPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [adding, setAdding] = useState(false)
  const [addState, setAddState] = useState<AddState>({ id: '', device_ip: '', label: '', type: 'wled' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const universeStatuses = status?.universes ?? {}
  const entries = Object.entries(universes).sort(([a], [b]) => Number(a) - Number(b))

  function startEdit(id: string, u: UniverseConfig) {
    setEditingId(id)
    setEditState({ id, device_ip: u.device_ip, label: u.label })
    setAdding(false)
    setConfirmDeleteId(null)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState(null)
    setError(null)
  }

  async function saveEdit() {
    if (!editState || editingId === null) return
    const newId = editState.id.trim()
    if (!newId || isNaN(Number(newId)) || Number(newId) < 1) {
      setError('Universe ID must be a positive number')
      return
    }
    if (newId !== editingId && universes[newId]) {
      setError(`Universe ${newId} already exists`)
      return
    }
    if (!editState.device_ip.trim()) {
      setError('IP address is required')
      return
    }

    const updated = { ...universes }
    const existing = updated[editingId]
    if (newId !== editingId) {
      delete updated[editingId]
    }
    updated[newId] = { ...existing, device_ip: editState.device_ip.trim(), label: editState.label.trim() }
    onChange(updated)

    setSaving(true)
    setError(null)
    try {
      await onSave(updated)
      cancelEdit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function deleteUniverse(id: string) {
    const updated = { ...universes }
    delete updated[id]
    onChange(updated)

    setSaving(true)
    setError(null)
    try {
      await onSave(updated)
      setConfirmDeleteId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveAdd() {
    const id = addState.id.trim()
    if (!id || isNaN(Number(id)) || Number(id) < 1) {
      setError('Universe ID must be a positive number')
      return
    }
    if (universes[id]) {
      setError(`Universe ${id} already exists`)
      return
    }
    if (!addState.device_ip.trim()) {
      setError('IP address is required')
      return
    }

    const updated = {
      ...universes,
      [id]: { device_ip: addState.device_ip.trim(), type: addState.type, label: addState.label.trim() },
    }
    onChange(updated)

    setSaving(true)
    setError(null)
    try {
      await onSave(updated)
      setAdding(false)
      setAddState({ id: '', device_ip: '', label: '', type: 'wled' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function startAdd() {
    setAdding(true)
    setEditingId(null)
    setEditState(null)
    setConfirmDeleteId(null)
    setError(null)
    setAddState({ id: '', device_ip: '', label: '', type: 'wled' })
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-muted">
          Universes ({entries.length})
        </h2>
        {!adding && (
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={startAdd} title="Add universe">
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 text-xs rounded bg-error-bg border border-error-border text-error-text">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {entries.map(([id, u]) => {
          const uStatus = universeStatuses[Number(id)]
          const isEditing = editingId === id
          const isConfirmingDelete = confirmDeleteId === id

          if (isEditing && editState) {
            return (
              <div key={id} className="rounded border border-accent/40 bg-surface p-3">
                <div className="grid grid-cols-[80px_1fr] gap-2 items-center text-sm">
                  <label className="text-text-faint text-xs">Universe</label>
                  <Input
                    type="number"
                    min={1}
                    value={editState.id}
                    onChange={(e) => setEditState({ ...editState, id: e.target.value })}
                    className="h-8 text-sm"
                  />
                  <label className="text-text-faint text-xs">IP</label>
                  <Input
                    value={editState.device_ip}
                    onChange={(e) => setEditState({ ...editState, device_ip: e.target.value })}
                    className="h-8 text-sm font-mono"
                    placeholder="192.168.1.100"
                  />
                  <label className="text-text-faint text-xs">Label</label>
                  <Input
                    value={editState.label}
                    onChange={(e) => setEditState({ ...editState, label: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="stage left"
                  />
                </div>
                <div className="flex gap-1 mt-3 justify-end">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={cancelEdit} disabled={saving} title="Cancel">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={saveEdit} disabled={saving} title="Save">
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          }

          return (
            <div
              key={id}
              className="rounded border border-border bg-surface p-3 flex items-center gap-3"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-text font-semibold tabular-nums shrink-0">#{id}</span>
                {u.label && <span className="text-text-dim truncate">{u.label}</span>}
              </div>
              <Badge
                className={cn(
                  'shrink-0 text-[10px] uppercase',
                  u.type === 'wled'
                    ? 'bg-accent/20 text-accent border-accent/30'
                    : 'bg-border text-text-muted border-border-muted'
                )}
              >
                {u.type}
              </Badge>
              <span className="text-text-faint text-xs font-mono shrink-0">{u.device_ip}</span>
              {u.type === 'wled' ? (
                <StatusDot online={uStatus?.online ?? false} />
              ) : (
                <span className="text-text-faint text-xs w-2 text-center">—</span>
              )}
              {isConfirmingDelete ? (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-error-text text-xs mr-1">Delete?</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 border-error-border text-error-text hover:bg-error-bg"
                    onClick={() => deleteUniverse(id)}
                    disabled={saving}
                    title="Confirm delete"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={saving}
                    title="Cancel delete"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => startEdit(id, u)}
                    title="Edit universe"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 text-text-faint hover:text-error-text hover:border-error-border"
                    onClick={() => { setConfirmDeleteId(id); setEditingId(null); setAdding(false); setError(null) }}
                    title="Delete universe"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )
        })}

        {adding && (
          <div className="rounded border border-accent/40 bg-surface p-3">
            <div className="grid grid-cols-[80px_1fr] gap-2 items-center text-sm">
              <label className="text-text-faint text-xs">Universe</label>
              <Input
                type="number"
                min={1}
                value={addState.id}
                onChange={(e) => setAddState({ ...addState, id: e.target.value })}
                className="h-8 text-sm"
                placeholder="3"
              />
              <label className="text-text-faint text-xs">IP</label>
              <Input
                value={addState.device_ip}
                onChange={(e) => setAddState({ ...addState, device_ip: e.target.value })}
                className="h-8 text-sm font-mono"
                placeholder="192.168.1.103"
              />
              <label className="text-text-faint text-xs">Label</label>
              <Input
                value={addState.label}
                onChange={(e) => setAddState({ ...addState, label: e.target.value })}
                className="h-8 text-sm"
                placeholder="floor wash"
              />
              <label className="text-text-faint text-xs">Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={cn(
                    'px-3 py-1 text-xs rounded border',
                    addState.type === 'wled'
                      ? 'bg-accent/20 text-accent border-accent/30'
                      : 'bg-surface text-text-muted border-border hover:border-border-muted'
                  )}
                  onClick={() => setAddState({ ...addState, type: 'wled' })}
                >
                  WLED
                </button>
                <button
                  type="button"
                  className={cn(
                    'px-3 py-1 text-xs rounded border',
                    addState.type === 'gateway'
                      ? 'bg-accent/20 text-accent border-accent/30'
                      : 'bg-surface text-text-muted border-border hover:border-border-muted'
                  )}
                  onClick={() => setAddState({ ...addState, type: 'gateway' })}
                >
                  Gateway
                </button>
              </div>
            </div>
            <div className="flex gap-1 mt-3 justify-end">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { setAdding(false); setError(null) }} disabled={saving} title="Cancel">
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={saveAdd} disabled={saving} title="Save">
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {entries.length === 0 && !adding && (
          <div className="text-text-faint text-sm text-center py-8">
            No universes configured. Click + to get started.
          </div>
        )}
      </div>
    </div>
  )
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full shrink-0',
        online ? 'bg-success' : 'bg-error'
      )}
      title={online ? 'Online' : 'Offline'}
    />
  )
}
