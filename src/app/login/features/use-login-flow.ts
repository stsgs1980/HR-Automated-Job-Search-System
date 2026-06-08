import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export type LoginStep = 'idle' | 'logging_in' | 'captcha' | 'two_fa' | 'success' | 'failed'

export interface LoginFlowState {
  step: LoginStep
  error: string | null
  captchaScreenshot: string | null
  captchaText: string
  twoFACode: string
}

export function useLoginFlow() {
  const router = useRouter()
  const [step, setStep] = useState<LoginStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [captchaScreenshot, setCaptchaScreenshot] = useState<string | null>(null)
  const [captchaText, setCaptchaText] = useState('')
  const [twoFACode, setTwoFACode] = useState('')
  const hasCheckedAuth = useRef(false)

  // Check auth status on mount
  useEffect(() => {
    if (hasCheckedAuth.current) return
    hasCheckedAuth.current = true

    const checkAuth = async () => {
      try {
        const res = await fetch('/api/hh/auth/status')
        const data = await res.json()
        if (data.connected) {
          router.replace('/')
        }
      } catch {
        // Ignore errors
      }
    }
    checkAuth()
  }, [router])

  // Poll login status
  useEffect(() => {
    if (step !== 'logging_in') return

    const interval = setInterval(async () => {
      try {
        const status = await fetch('/api/hh/auth/login-status').then(r => r.json())
        if (status.state === 'success') {
          setStep('success')
          setTimeout(() => router.replace('/'), 1500)
        } else if (status.state === 'captcha_required') {
          setStep('captcha')
          if (status.screenshot) setCaptchaScreenshot(status.screenshot)
        } else if (status.state === 'two_fa_required') {
          setStep('two_fa')
          if (status.screenshot) setCaptchaScreenshot(status.screenshot)
        } else if (status.state === 'failed') {
          setStep('failed')
          setError(status.error || 'Ошибка входа')
        }
      } catch {
        // Continue polling
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [step, router])

  const startLogin = useCallback(async (email: string, password: string) => {
    setStep('logging_in')
    setError(null)
    setCaptchaScreenshot(null)

    try {
      const result = await fetch('/api/hh/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).then(r => r.json())

      if (result.state === 'success') {
        setStep('success')
        setTimeout(() => router.replace('/'), 1500)
      } else if (result.state === 'captcha_required') {
        setStep('captcha')
        if (result.screenshot) setCaptchaScreenshot(result.screenshot)
      } else if (result.state === 'two_fa_required') {
        setStep('two_fa')
        if (result.screenshot) setCaptchaScreenshot(result.screenshot)
      } else if (result.state === 'failed') {
        setStep('failed')
        setError(result.error || 'Ошибка входа')
      }
    } catch (err: any) {
      setStep('failed')
      setError(err.message || 'Ошибка подключения к серверу')
    }
  }, [router])

  const submitCaptcha = useCallback(async () => {
    if (!captchaText) return
    setStep('logging_in')

    try {
      const result = await fetch('/api/hh/auth/solve-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: captchaText }),
      }).then(r => r.json())

      if (result.state === 'success') {
        setStep('success')
        setTimeout(() => router.replace('/'), 1500)
      } else if (result.state === 'captcha_required') {
        setStep('captcha')
        if (result.screenshot) setCaptchaScreenshot(result.screenshot)
        setCaptchaText('')
        setError('Неверный текст CAPTCHA, попробуйте снова')
      } else if (result.state === 'two_fa_required') {
        setStep('two_fa')
      } else if (result.state === 'failed') {
        setStep('failed')
        setError(result.error || 'Ошибка при вводе CAPTCHA')
      }
    } catch (err: any) {
      setStep('captcha')
      setError(err.message)
    }
  }, [captchaText, router])

  const submit2FA = useCallback(async () => {
    if (!twoFACode) return
    setStep('logging_in')

    try {
      const result = await fetch('/api/hh/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: twoFACode }),
      }).then(r => r.json())

      if (result.state === 'success') {
        setStep('success')
        setTimeout(() => router.replace('/'), 1500)
      } else if (result.state === 'two_fa_required') {
        setStep('two_fa')
        setTwoFACode('')
        setError('Неверный код, попробуйте снова')
      } else if (result.state === 'failed') {
        setStep('failed')
        setError(result.error || 'Ошибка при вводе 2FA')
      }
    } catch (err: any) {
      setStep('two_fa')
      setError(err.message)
    }
  }, [twoFACode, router])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setCaptchaScreenshot(null)
    setCaptchaText('')
    setTwoFACode('')
  }, [])

  return {
    step,
    error,
    captchaScreenshot,
    captchaText,
    twoFACode,
    setCaptchaText,
    setTwoFACode,
    startLogin,
    submitCaptcha,
    submit2FA,
    reset
  }
}
