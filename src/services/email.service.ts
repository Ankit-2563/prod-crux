import nodemailer from "nodemailer";

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

if (!EMAIL_USER || !EMAIL_PASS) {
  throw new Error("EMAIL_USER and EMAIL_PASS must be defined in environment variables");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

export const sendPasswordResetEmail = async (
  toEmail: string,
  resetToken: string
): Promise<void> => {
  const mailOptions = {
    from: `"Crux" <${EMAIL_USER}>`,
    to: toEmail,
    subject: "Your Password Reset Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #111;">Reset Your Password</h2>
        <p style="color: #555; font-size: 15px;">
          Use the 6-digit code below to reset your password.
          This code expires in <strong>1 minute</strong>.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <span style="display: inline-block; font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #0a7ea4; background: #f0f8ff; padding: 16px 32px; border-radius: 8px;">
            ${resetToken}
          </span>
        </div>
        <p style="color: #999; font-size: 13px;">
          If you did not request a password reset, please ignore this email.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};
