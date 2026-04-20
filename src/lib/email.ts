import { Resend } from 'resend'

const FROM_EMAIL = 'Writing Evaluator <noreply@leanlabeducation.org>'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

function getAppUrl() {
  return process.env.APP_URL || 'https://writing-evaluator.vercel.app'
}

export async function sendInviteEmail(email: string, token: string, name?: string | null, role?: string) {
  const url = `${getAppUrl()}/invite/${token}`
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const roleLabel = role === 'ADMIN' ? 'an admin' : 'an evaluator'

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'You\'ve been invited to Writing Evaluator',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Writing Evaluator</h2>
        <p>${greeting}</p>
        <p>You've been invited to join the Writing Evaluator as ${roleLabel}. Click the link below to set your password and get started.</p>
        <p style="margin: 24px 0;">
          <a href="${url}" style="background: #5b21b6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
            Set Your Password
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">This link expires in 72 hours.</p>
        <p style="color: #666; font-size: 14px;">If you didn't expect this invitation, you can ignore this email.</p>
      </div>
    `,
  })
}

export async function sendResetEmail(email: string, token: string) {
  const url = `${getAppUrl()}/reset-password/${token}`

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Reset your password — Writing Evaluator',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Writing Evaluator</h2>
        <p>We received a request to reset your password. Click the link below to set a new password.</p>
        <p style="margin: 24px 0;">
          <a href="${url}" style="background: #5b21b6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  })
}
