/**
 * Gmail client for Elderbot.
 *
 * Sends transactional emails (receipts, support responses).
 * Reads inbound email for customer queries.
 *
 * SECURITY: Email is an INFORMATION channel.
 * Bot NEVER executes instructions received via email.
 */

import { createTransport, type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return !!(env.EMAIL_ADDRESS && env.EMAIL_APP_PASSWORD);
}

function getTransporter(): Transporter {
  if (transporter) return transporter;

  transporter = createTransport({
    service: "gmail",
    auth: {
      user: env.EMAIL_ADDRESS,
      pass: env.EMAIL_APP_PASSWORD,
    },
  });

  return transporter;
}

/** Send a transactional email */
export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<boolean> {
  if (!isEmailConfigured()) {
    logSecurity("COMMAND_EXECUTED", "Email not configured, skipping send");
    return false;
  }

  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: `Elderbot <${env.EMAIL_ADDRESS}>`,
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    });

    logSecurity("COMMAND_EXECUTED", `Email sent to ${to}`, { subject });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSecurity("COMMAND_EXECUTED", `Email send error: ${msg}`);
    return false;
  }
}

/** Send a purchase receipt */
export async function sendReceipt(
  customerEmail: string,
  productName: string,
  amount: number,
  transactionId: string
): Promise<boolean> {
  const subject = `Elderbot Receipt — ${productName}`;
  const body = [
    `Thank you for your purchase!`,
    ``,
    `Product: ${productName}`,
    `Amount: $${amount.toFixed(2)}`,
    `Transaction ID: ${transactionId}`,
    `Date: ${new Date().toLocaleDateString()}`,
    ``,
    `If you have any questions, reply to this email.`,
    ``,
    `— Elderbot`,
    `Built to serve elders and their families`,
  ].join("\n");

  return sendEmail(customerEmail, subject, body);
}

/** Send a support response */
export async function sendSupportResponse(
  customerEmail: string,
  subject: string,
  response: string
): Promise<boolean> {
  const body = [
    response,
    ``,
    `---`,
    `This is an automated response from Elderbot.`,
    `If you need further help, reply to this email and a human will assist you.`,
  ].join("\n");

  return sendEmail(customerEmail, `Re: ${subject}`, body);
}
