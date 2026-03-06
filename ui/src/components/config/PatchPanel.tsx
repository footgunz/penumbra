import { useEffect, useState } from 'react'
import { t } from '@lingui/core/macro'
import type { Patch, UniverseConfig } from '@/types'
import type { Fixture } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pencil, Trash2, Plus, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FixturePicker } from './FixturePicker'
import { ChannelStrip } from './ChannelStrip'
import { getChannelCount, nextFreeAddress, hasOverlap } from './patch-utils'

interface PatchPanelProps {
  universeId: string
  universe: UniverseConfig
  onSave: (patches: Patch[]) => Promise<void>
}

interface EditPatchState {
  label: string
  startAddress: number
  channels: string[]
}

export function PatchPanel({ universeId, universe, onSave }: PatchPanelProps) {
  const [fixtures, setFixtures] = useState<Record<string, Fixture> | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editState, setEditState] = useState<EditPatchState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null)

  const patches = universe.patches ?? []

  // Fetch fixtures on mount
  useEffect(() => {
    fetch('/api/fixtures')
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.json() as Promise<Record<string, Fixture>>
      })
      .then(setFixtures)
      .catch(() => {
        // Fixtures are optional — manual mode still works
      })
  }, [])

  async function savePatchList(newPatches: Patch[]) {
    // Validate no overlap
    const overlap = hasOverlap(newPatches, fixtures)
    if (overlap) {
      const a = newPatches[overlap.indexA]
      const b = newPatches[overlap.indexB]
      setError(t`Overlap at channel ${overlap.channel}: "${a.label}" and "${b.label}"`)
      return
    }

    // Validate addresses in range
    for (const p of newPatches) {
      const count = getChannelCount(p, fixtures)
      if (p.startAddress < 1 || p.startAddress + count - 1 > 512) {
        setError(t`"${p.label}" exceeds DMX address range (1-512)`)
        return
      }
    }

    setSaving(true)
    setError(null)
    try {
      await onSave(newPatches)
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Save failed`)
    } finally {
      setSaving(false)
    }
  }

  function addPatch(fixtureKey: string, channels?: string[]) {
    const fixture = fixtures?.[fixtureKey]
    const label = fixture?.shortName ?? t`Manual`
    const startAddress = nextFreeAddress(patches, fixtures)

    const newPatch: Patch = {
      fixtureKey,
      label,
      startAddress,
      ...(fixtureKey === 'manual' && channels ? { channels } : {}),
    }

    const newPatches = [...patches, newPatch]
    setShowPicker(false)
    void savePatchList(newPatches)
  }

  function startEdit(index: number) {
    const patch = patches[index]
    setEditingIndex(index)
    setEditState({
      label: patch.label,
      startAddress: patch.startAddress,
      channels: patch.channels ? [...patch.channels] : [],
    })
    setShowPicker(false)
    setConfirmDeleteIndex(null)
    setError(null)
  }

  function cancelEdit() {
    setEditingIndex(null)
    setEditState(null)
    setError(null)
  }

  function saveEdit() {
    if (editingIndex === null || !editState) return
    const patch = patches[editingIndex]
    const updated: Patch = {
      ...patch,
      label: editState.label.trim() || patch.label,
      startAddress: editState.startAddress,
      ...(patch.fixtureKey === 'manual' && editState.channels.length > 0
        ? { channels: editState.channels }
        : {}),
    }
    const newPatches = patches.map((p, i) => (i === editingIndex ? updated : p))
    cancelEdit()
    void savePatchList(newPatches)
  }

  function deletePatch(index: number) {
    const newPatches = patches.filter((_, i) => i !== index)
    setConfirmDeleteIndex(null)
    void savePatchList(newPatches)
  }

  function getFixtureShortName(fixtureKey: string): string | null {
    if (fixtureKey === 'manual') return null
    return fixtures?.[fixtureKey]?.shortName ?? fixtureKey
  }

  return (
    <div className="flex-1 overflow-auto p-4 border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-text">
            {t`Patch`}: #{universeId}
          </h2>
          {universe.label && (
            <span className="text-xs text-text-muted">{universe.label}</span>
          )}
        </div>
        {!showPicker && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1"
            onClick={() => {
              setShowPicker(true)
              setEditingIndex(null)
              setConfirmDeleteIndex(null)
              setError(null)
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t`Add Fixture`}
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 text-xs rounded bg-error-bg border border-error-border text-error-text">
          {error}
        </div>
      )}

      {/* Fixture picker */}
      {showPicker && (
        <FixturePicker
          fixtures={fixtures}
          onSelect={addPatch}
          onCancel={() => setShowPicker(false)}
        />
      )}

      {/* Patch list */}
      <div className="flex flex-col gap-2">
        {patches.map((patch, index) => {
          const channelCount = getChannelCount(patch, fixtures)
          const endAddress = patch.startAddress + channelCount - 1
          const shortName = getFixtureShortName(patch.fixtureKey)
          const isEditing = editingIndex === index
          const isConfirmingDelete = confirmDeleteIndex === index

          if (isEditing && editState) {
            return (
              <div key={index} className="rounded border border-accent/40 bg-surface p-3">
                <div className="grid grid-cols-[80px_1fr] gap-2 items-center text-sm">
                  <label className="text-text-faint text-xs">{t`Label`}</label>
                  <Input
                    value={editState.label}
                    onChange={(e) => setEditState({ ...editState, label: e.target.value })}
                    className="h-8 text-sm"
                  />
                  <label className="text-text-faint text-xs">{t`Start Address`}</label>
                  <Input
                    type="number"
                    min={1}
                    max={512}
                    value={editState.startAddress}
                    onChange={(e) =>
                      setEditState({ ...editState, startAddress: Number(e.target.value) })
                    }
                    className="h-8 text-sm"
                  />
                  {patch.fixtureKey === 'manual' && editState.channels.length > 0 && (
                    <>
                      <label className="text-text-faint text-xs self-start pt-2">{t`Channels`}</label>
                      <div className="flex flex-col gap-1">
                        {editState.channels.map((ch, ci) => (
                          <Input
                            key={ci}
                            value={ch}
                            onChange={(e) => {
                              const updated = [...editState.channels]
                              updated[ci] = e.target.value
                              setEditState({ ...editState, channels: updated })
                            }}
                            className="h-7 text-xs"
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex gap-1 mt-3 justify-end">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={cancelEdit}
                    disabled={saving}
                    title={t`Cancel`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={saveEdit}
                    disabled={saving}
                    title={t`Save`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          }

          return (
            <div
              key={index}
              className="rounded border border-border bg-surface p-3 flex items-center gap-3"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-text font-medium text-sm truncate">{patch.label}</span>
                {shortName && shortName !== patch.label && (
                  <span className="text-text-muted text-xs truncate">({shortName})</span>
                )}
              </div>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {channelCount}ch
              </Badge>
              <span className="text-text-faint text-xs font-mono shrink-0">
                {patch.startAddress}–{endAddress}
              </span>
              {isConfirmingDelete ? (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-error-text text-xs mr-1">{t`Delete?`}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn('h-7 w-7 border-error-border text-error-text hover:bg-error-bg')}
                    onClick={() => deletePatch(index)}
                    disabled={saving}
                    title={t`Confirm delete`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setConfirmDeleteIndex(null)}
                    disabled={saving}
                    title={t`Cancel delete`}
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
                    onClick={() => startEdit(index)}
                    title={t`Edit patch`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 text-text-faint hover:text-error-text hover:border-error-border"
                    onClick={() => {
                      setConfirmDeleteIndex(index)
                      setEditingIndex(null)
                      setShowPicker(false)
                      setError(null)
                    }}
                    title={t`Delete patch`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )
        })}

        {patches.length === 0 && !showPicker && (
          <div className="text-text-faint text-sm text-center py-8">
            {t`No fixtures assigned. Click "Add Fixture" to get started.`}
          </div>
        )}
      </div>

      {/* Channel strip */}
      <ChannelStrip patches={patches} fixtures={fixtures} />
    </div>
  )
}
