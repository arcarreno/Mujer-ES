// _shared/smtp.ts — Gmail SMTP helper para Edge Functions
// Usa: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS de Deno.env
// Configura en Supabase: supabase secrets set SMTP_USER SMTP_PASS

const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com"
const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") ?? "587")
const SMTP_USER = Deno.env.get("SMTP_USER") ?? ""
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? ""
const SMTP_FROM = Deno.env.get("SMTP_FROM") ?? "mujer.3s1224@gmail.com"

export function getSmtpConfig() {
  return { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM }
}

export function isSmtpConfigured(): boolean {
  return !!(SMTP_USER && SMTP_PASS)
}

/**
 * Envía un email vía SMTP usando la API de nodemailer.
 * Requiere que SMTP_USER y SMTP_PASS estén configurados en secrets.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (!isSmtpConfigured()) {
    console.warn("SMTP not configured — skipping email")
    return
  }

  // Construimos el mensaje SMTP manualmente usando fetch al endpoint de Gmail SMTP
  // Usamos nodemailer vía npm
  const nodemailer = await import("npm:nodemailer@6.9.16")

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // STARTTLS en puerto 587
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })

  try {
    const info = await transporter.sendMail({
      from: `"Mujer-ES" <${SMTP_FROM}>`,
      to,
      subject,
      html,
    })
    console.log("Email sent:", info.messageId)
  } catch (err) {
    console.error("SMTP send error:", err)
    throw err
  }
}
