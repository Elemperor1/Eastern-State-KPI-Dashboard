import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyCredentials } from "@/lib/auth";
import { getSession, AuthError } from "@/lib/session";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid email and password." },
        { status: 400 },
      );
    }
    const { email, password } = parsed.data;
    const user = await verifyCredentials(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }
    const session = await getSession();
    session.user = user;
    await session.save();
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("login error", err);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}