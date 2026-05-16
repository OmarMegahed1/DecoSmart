import { env } from "../../env";

/**
 * Sends email-verification links (email change, optional signup verification if enabled later).
 * Used by Better Auth `emailVerification.sendVerificationEmail`.
 * Do not await in the auth callback — use `void …catch` like password reset.
 */
export async function sendAuthVerificationEmail(to: string, verificationUrl: string): Promise<void> {
  const apiKey = env.resend.apiKey;
  if (!apiKey) {
    if (env.isDev) {
      console.warn(
        `[email verification] RESEND_API_KEY not set — email not sent. Link for ${to}:\n${verificationUrl}`
      );
    } else {
      console.error(
        `[email verification] RESEND_API_KEY not set — cannot send verification email to ${to}`
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
      subject: "Verify your email for Deco-Smart",
      text:
        `Use the link below to verify this email address for your Deco-Smart account. ` +
        `If you requested an email change, your sign-in address updates only after you confirm.\n\n` +
        `Open this link (or paste it into your browser). On mobile it may open the Deco-Smart app if installed:\n\n` +
        `${verificationUrl}\n\n` +
        `If you did not request this, you can ignore this email.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
}
