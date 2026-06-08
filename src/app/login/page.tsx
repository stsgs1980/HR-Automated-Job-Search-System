'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Bot } from 'lucide-react'
import { useLoginForm, useLoginFlow } from './features'
import { LoginForm, LoginLoading, LoginCaptcha, Login2FA, LoginSuccess, LoginFailed } from './sections'

export default function LoginPage() {
  const form = useLoginForm()
  const flow = useLoginFlow()

  const handleSubmit = () => {
    flow.startLogin(form.email, form.password)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bot className="w-8 h-8 text-emerald-600" />
          </div>
          <CardTitle className="text-2xl">HH Bot</CardTitle>
          <CardDescription>
            Войдите через аккаунт HH.ru для работы с дашбордом
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flow.step === 'idle' && (
            <LoginForm
              email={form.email}
              password={form.password}
              showPassword={form.showPassword}
              onEmailChange={form.setEmail}
              onPasswordChange={form.setPassword}
              onTogglePassword={form.toggleShowPassword}
              onSubmit={handleSubmit}
              isValid={form.isValid}
            />
          )}
          {flow.step === 'logging_in' && <LoginLoading />}
          {flow.step === 'captcha' && (
            <LoginCaptcha
              screenshot={flow.captchaScreenshot}
              value={flow.captchaText}
              error={flow.error}
              onChange={flow.setCaptchaText}
              onSubmit={flow.submitCaptcha}
            />
          )}
          {flow.step === 'two_fa' && (
            <Login2FA
              screenshot={flow.captchaScreenshot}
              value={flow.twoFACode}
              error={flow.error}
              onChange={flow.setTwoFACode}
              onSubmit={flow.submit2FA}
            />
          )}
          {flow.step === 'success' && <LoginSuccess />}
          {flow.step === 'failed' && (
            <LoginFailed
              error={flow.error}
              screenshot={flow.captchaScreenshot}
              onRetry={flow.reset}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
