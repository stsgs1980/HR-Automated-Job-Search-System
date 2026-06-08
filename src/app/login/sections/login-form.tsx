'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, Key, Lock, Mail } from 'lucide-react'

interface LoginFormProps {
  email: string
  password: string
  showPassword: boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onTogglePassword: () => void
  onSubmit: () => void
  isValid: boolean
}

export function LoginForm({
  email,
  password,
  showPassword,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onSubmit,
  isValid
}: LoginFormProps) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit() }} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email от HH.ru</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className="pl-10"
            required
            autoComplete="email"
            autoFocus
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Пароль от HH.ru</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="pl-10 pr-10"
            required
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full bg-emerald-600 hover:bg-emerald-700 h-10"
        disabled={!isValid}
      >
        <Key className="w-4 h-4 mr-2" />
        Войти через HH.ru
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Пароль нужен только для входа. Мы сохраняем только cookies, не пароль.
      </p>
    </form>
  )
}
