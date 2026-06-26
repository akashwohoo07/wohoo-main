import nodemailer from "nodemailer";

const getTransporter = () => nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendInviteEmail = async ({ toEmail, inviterName, tripName, destination, startDate, inviteUrl, role }) => {
  const transporter = getTransporter();
  const dateStr = startDate
    ? new Date(startDate).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
    : null;

  await transporter.sendMail({
    from: `${process.env.APP_NAME} <${process.env.FROM_EMAIL}>`,
    to: toEmail,
    subject: `${inviterName} invited you to join "${tripName}"`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
        <h2 style="margin:0 0 8px;font-size:22px;color:#18181b;">You're invited! ✈</h2>
        <p style="color:#71717a;font-size:14px;margin:0 0 24px;">
          <strong style="color:#18181b;">${inviterName}</strong> has invited you to join their trip.
        </p>
        <div style="background:#fafafa;border:1px solid #f4f4f5;border-radius:16px;padding:20px;margin-bottom:24px;">
          <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#18181b;">${tripName}</p>
          ${destination ? `<p style="margin:0 0 4px;color:#71717a;font-size:13px;">📍 ${destination}</p>` : ""}
          ${dateStr ? `<p style="margin:0;color:#71717a;font-size:13px;">📅 ${dateStr}</p>` : ""}
          <p style="margin:8px 0 0;font-size:12px;color:#a1a1aa;">Access: <strong style="color:#18181b;text-transform:capitalize;">${role}</strong></p>
        </div>
        <a href="${inviteUrl}" style="display:block;background:#ef4444;color:white;text-align:center;padding:14px;border-radius:50px;font-weight:600;font-size:14px;text-decoration:none;margin-bottom:16px;">
          Accept Invitation
        </a>
        <p style="color:#a1a1aa;font-size:12px;text-align:center;">
          Expires in 7 days. If unexpected, ignore this email.
        </p>
      </div>
    `,
  });
};

export const sendUsernameConfirmEmail = async ({ toEmail, name, username }) => {
  const transporter = getTransporter();

  await transporter.sendMail({
    from: `${process.env.APP_NAME} <${process.env.FROM_EMAIL}>`,
    to: toEmail,
    subject: `Your username has been set — @${username}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
        <h2 style="margin:0 0 8px;font-size:22px;color:#18181b;">Username confirmed ✓</h2>
        <p style="color:#71717a;font-size:14px;margin:0 0 16px;">Hey ${name}, your username has been set.</p>
        <div style="background:#fafafa;border:1px solid #f4f4f5;border-radius:16px;padding:20px;margin-bottom:24px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#18181b;">@${username}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#a1a1aa;">You can change this again after 30 days.</p>
        </div>
      </div>
    `,
  });
};