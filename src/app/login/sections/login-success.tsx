'use client'

import { CheckCircle2 } from 'lucide-react'

export function LoginSuccess() {
  return (
    <div className="text-center py-8 space-y-3">
      <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
      <p className="font-medium">Вход выполнен!</p>
      <p className="text-sm text-muted-foreground">
        Перенаправление в дашборд...
      </p>
    </div>
  )
}
