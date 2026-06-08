'use client'

import { Loader2 } from 'lucide-react'

export function LoginLoading() {
  return (
    <div className="text-center py-8 space-y-3">
      <Loader2 className="w-10 h-10 mx-auto text-emerald-600 animate-spin" />
      <p className="font-medium">Выполняется вход на HH.ru...</p>
      <p className="text-sm text-muted-foreground">
        Открывается браузер, вводятся данные
      </p>
    </div>
  )
}
