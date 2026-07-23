const encoder = new TextEncoder();

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
}

export type TelegramMiniAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400
): Promise<TelegramMiniAppUser> {
  if (!initData || !botToken) throw new Error("TELEGRAM_AUTH_REQUIRED");

  const params = new URLSearchParams(initData);
  const providedHash = params.get("hash");
  if (!providedHash) throw new Error("TELEGRAM_HASH_MISSING");
  params.delete("hash");

  const authDate = Number(params.get("auth_date") || 0);
  if (!Number.isFinite(authDate) || authDate <= 0) throw new Error("TELEGRAM_AUTH_DATE_INVALID");
  if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) throw new Error("TELEGRAM_AUTH_EXPIRED");

  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256(encoder.encode("WebAppData"), botToken);
  const calculatedHash = bytesToHex(await hmacSha256(secretKey, checkString));

  if (calculatedHash.toLowerCase() !== providedHash.toLowerCase()) {
    throw new Error("TELEGRAM_AUTH_INVALID");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("TELEGRAM_USER_MISSING");

  let user: TelegramMiniAppUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new Error("TELEGRAM_USER_INVALID");
  }

  if (!Number.isSafeInteger(Number(user.id))) throw new Error("TELEGRAM_USER_ID_INVALID");
  user.id = Number(user.id);
  return user;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = Deno.env.get("APP_ORIGIN") || "https://miuiproking.github.io";
  const resolvedOrigin = origin && origin.startsWith(allowedOrigin) ? origin : allowedOrigin;
  return {
    "Access-Control-Allow-Origin": resolvedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}

export function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin)
  });
}
