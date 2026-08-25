import { createTransport, Transporter, SendMailOptions } from "nodemailer";
import { env } from "../../config/env.js";

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_SECURE, // true for 465, false for other ports
      tls: {
        // do not fail on invalid certs
        rejectUnauthorized: env.EMAIL_TLS ? false : true,
      },
      auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_PASSWORD,
      },
    });
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    const mailOptions: SendMailOptions = {
      from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      ...(options.html && { html: options.html }),
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (err: any) {
      throw new Error(`Failed to send email: ${err.message}`);
    }
  }

  /**
   * Send a verification email
   */
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verificationUrl = `${env.API_BASE_URL}/api/auth/verify-email/${token}`;

    await this.sendEmail({
      to,
      subject: "Verify your CodeGuard AI account",
      text: `Please verify your account by clicking the link below:\n\n${verificationUrl}\n\nThis link will expire in 24 hours.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verify your CodeGuard AI account</h2>
          <p>Thank you for signing up for CodeGuard AI! Please click the button below to verify your email address:</p>
          <a href="${verificationUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">Verify Email</a>
          <p>Or copy and paste this link into your browser:</p>
          <p>${verificationUrl}</p>
          <p>This link will expire in 24 hours.</p>
          <hr>
          <p style="font-size: 12px; color: #666;">If you didn't create an account with CodeGuard AI, please ignore this email.</p>
        </div>
      `,
    });
  }

  /**
   * Send a password reset email
   */
  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `${env.API_BASE_URL}/api/auth/reset-password/confirm`;

    await this.sendEmail({
      to,
      subject: "Reset your CodeGuard AI password",
      text: `You requested to reset your password. Please click the link below to reset your password:\n\n${resetUrl}?token=${token}\n\nThis link will expire in 1 hour.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset your CodeGuard AI password</h2>
          <p>We received a request to reset your password for your CodeGuard AI account. Click the button below to reset your password:</p>
          <a href="${resetUrl}?token=${token}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">Reset Password</a>
          <p>Or copy and paste this link into your browser:</p>
          <p>${resetUrl}?token=${token}</p>
          <p>This link will expire in 1 hour for security reasons.</p>
          <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
          <hr>
          <p style="font-size: 12px; color: #666;">If you didn't request a password reset, please ignore this email.</p>
        </div>
      `,
    });
  }

  /**
   * Test the email connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (err: any) {
      return false;
    }
  }
}