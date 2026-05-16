import { env } from "../../env";

/**
 * Sends the password-reset link. Used by Better Auth `sendResetPassword`.
 * Do not await this in the auth callback (timing attacks). Fire with `void`.
 *
 * Set `RESEND_API_KEY` (and optionally `RESEND_FROM`) in production so users receive mail.
 * In development without Resend, the reset URL is logged to the server console.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const apiKey = env.resend.apiKey;
  if (!apiKey) {
    if (env.isDev) {
      console.warn(
        `[password reset] RESEND_API_KEY not set — email not sent. Reset link for ${to}:\n${resetUrl}`
      );
    } else {
      console.error(
        `[password reset] RESEND_API_KEY not set — cannot send reset email to ${to}`
      );
    }
    return;
  }

  const from = env.resend.from;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your Deco-Smart password",
      text:
        `We received a request to reset your password.\n\n` +
        `Open this link (or paste it into your browser). On mobile it should open the Deco-Smart app if installed:\n\n` +
        `${resetUrl}\n\n` +
        `If you did not request this, you can ignore this email.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
}
