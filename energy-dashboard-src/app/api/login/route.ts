import { NextResponse } from "next/server";
import { createSession, validatePassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { z } from "zod";

type LoginPayload = {
  password?: string;
};

export async function POST(request: Request) {
  const clientId = extractClientId(request);
  const limit = rateLimit(`login:${clientId}`, { windowMs: 10 * 60 * 1000, max: 8 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Příliš mnoho pokusů o přihlášení. Zkuste to prosím později." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((limit.resetAt - Date.now()) / 1000).toString(),
        },
      },
    );
  }

  const payload = await parseRequest(request);

  const password = typeof payload.password === "string" ? payload.password : "";

  if (!password || !validatePassword(password)) {
    return NextResponse.json({ error: "Nesprávné heslo." }, { status: 401 });
  }

  await createSession();
  return NextResponse.json({ ok: true });
}

type RequestWithIp = Request & { ip?: string };

function extractClientId(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const withIp = request as RequestWithIp;
  if (typeof withIp.ip === "string") {
    return withIp.ip;
  }
  return "unknown";
}

async function parseRequest(request: Request): Promise<LoginPayload> {
  const json = (await request.json().catch(() => ({}))) as unknown;
  const schema = z.object({ password: z.string().min(1) }).partial();
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : {};
}
