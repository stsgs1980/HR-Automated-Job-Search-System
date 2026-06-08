export type LoginStep = "idle" | "logging_in" | "captcha" | "two_fa" | "success" | "failed";

export interface LoginState {
  email: string;
  password: string;
  showPassword: boolean;
  loginStep: LoginStep;
  loginError: string | null;
  captchaScreenshot: string | null;
  captchaText: string;
  twoFACode: string;
}
