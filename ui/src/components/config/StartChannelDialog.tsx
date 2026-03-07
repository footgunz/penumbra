import { useEffect, useRef, useState } from 'react'
import { t } from '@lingui/core/macro'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface StartChannelDialogProps {
  open: boolean
  defaultChannel: number
  fixtureLabel: string
  channelCount: number
  onConfirm: (startAddress: number) => void
  onCancel: () => void
}

export function StartChannelDialog({
  open,
  defaultChannel,
  fixtureLabel,
  channelCount,
  onConfirm,
  onCancel,
}: StartChannelDialogProps) {
  const [value, setValue] = useState(String(defaultChannel))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(String(defaultChannel))
    }
  }, [open, defaultChannel])

  const parsed = parseInt(value, 10)
  const isValid = !isNaN(parsed) && parsed >= 1 && parsed <= 512 && parsed + channelCount - 1 <= 512

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isValid) onConfirm(parsed)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t`Create Manual Fixture`}</DialogTitle>
          <DialogDescription>
            {t`Placing "${fixtureLabel}" (${channelCount} channels)`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 py-4">
            <Label htmlFor="start-channel">{t`Start Channel`}</Label>
            <Input
              ref={inputRef}
              id="start-channel"
              type="number"
              min={1}
              max={512}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            {value && !isValid && (
              <p className="text-xs text-error-text">
                {t`Channel must be 1–512 and fit ${channelCount} channels.`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t`Cancel`}
            </Button>
            <Button type="submit" disabled={!isValid}>
              {t`Create`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
