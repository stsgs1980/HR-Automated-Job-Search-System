import { useState, useCallback } from 'react'

export interface LoginFormState {
  email: string
  password: string
  showPassword: boolean
}

export function useLoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const setEmailValue = useCallback((value: string) => setEmail(value), [])
  const setPasswordValue = useCallback((value: string) => setPassword(value), [])
  const toggleShowPassword = useCallback(() => setShowPassword(v => !v), [])
  const reset = useCallback(() => {
    setEmail('')
    setPassword('')
    setShowPassword(false)
  }, [])

  const isValid = email.length > 0 && password.length > 0

  return {
    email,
    password,
    showPassword,
    setEmail: setEmailValue,
    setPassword: setPasswordValue,
    toggleShowPassword,
    reset,
    isValid
  }
}
