import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;

    if (config.enabled) {
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth:
          config.user && config.pass
            ? {
                user: config.user,
                pass: config.pass,
              }
            : undefined,
      });
    }
  }

  async sendEmail(message: EmailMessage): Promise<boolean> {
    if (!this.config.enabled || !this.transporter) {
      console.log(
        "[Email] Email disabled, skipping:",
        message.subject,
        "to",
        message.to,
      );
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.from}>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      console.log(
        "[Email] Sent:",
        message.subject,
        "to",
        message.to,
        "messageId:",
        info.messageId,
      );
      return true;
    } catch (error) {
      console.error(
        "[Email] Failed to send:",
        message.subject,
        "to",
        message.to,
        error,
      );
      return false;
    }
  }

  async verify(): Promise<boolean> {
    if (!this.config.enabled || !this.transporter) {
      return true; // Not an error if email is disabled
    }

    try {
      await this.transporter.verify();
      console.log("[Email] SMTP connection verified successfully");
      return true;
    } catch (error) {
      console.error("[Email] SMTP verification failed:", error);
      return false;
    }
  }
}

export function createEmailService(config: EmailConfig): EmailService {
  return new EmailService(config);
}
