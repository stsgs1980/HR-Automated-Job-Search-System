'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Image } from 'lucide-react'

interface LoginCaptchaProps {
  screenshot: string | null
  value: string
  error: string | null
  onChange: (value: string) => void
  onSubmit: () => void
}

export function LoginCaptcha({
  screenshot,
  value,
  error,
  onChange,
  onSubmit
}: LoginCaptchaProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-600">
        <Image className="w-5 h-5" />
        <p className="font-medium">HH.ru запросил CAPTCHA</p>
      </div>

      {screenshot && (
        <div className="border rounded-lg overflow-hidden">
          <img
            src={`data:image/jpeg;base64,${screenshot}`}
            alt="CAPTCHA"
            className="w-full"
          />
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Введите текст с картинки"
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
