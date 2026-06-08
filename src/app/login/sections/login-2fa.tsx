'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageSquare } from 'lucide-react'

interface Login2FAProps {
  screenshot: string | null
  value: string
  error: string | null
  onChange: (value: string) => void
  onSubmit: () => void
}

export function Login2FA({
  screenshot,
  value,
  error,
  onChange,
  onSubmit
}: Login2FAProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-600">
        <MessageSquare className="w-5 h-5" />
        <p className="font-medium">Введите код подтверждения</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Код отправлен на ваш email или телефон
      </p>

      {screenshot && (
        <div className="border rounded-lg overflow-hidden">
          <img
            src={`data:image/jpeg;base64,${screenshot}`}
            alt="2FA screen"
            className="w-full"
          />
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Код подтверждения"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          autoFocus
        />
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
          onClick={onSubmit}
          disabled={!value}
        >
          Отправить
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
