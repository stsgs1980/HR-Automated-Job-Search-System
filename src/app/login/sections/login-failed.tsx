'use client'

import { Button } from '@/components/ui/button'
import { XCircle } from 'lucide-react'

interface LoginFailedProps {
  error: string | null
  screenshot: string | null
  onRetry: () => void
}

export function LoginFailed({ error, screenshot, onRetry }: LoginFailedProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-red-600">
        <XCircle className="w-5 h-5" />
        <p className="font-medium">Ошибка входа</p>
      </div>
      <p className="text-sm text-muted-foreground">
        {error || 'Не удалось войти. Проверьте данные и попробуйте снова.'}
      </p>

      {screenshot && (
        <div className="border rounded-lg overflow-hidden">
          <img
            src={`data:image/jpeg;base64,${screenshot}`}
            alt="Error screenshot"
            className="w-full"
          />
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={onRetry}>
        Попробовать снова
      </Button>
    </div>
  )
}
