import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応しています" });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
  if (!ok) {
    return res.status(400).json({ error: "メールアドレスが正しくありません" });
  }

  await redis.sadd("emails", email); // 重複は自動で無視される
  return res.status(200).json({ ok: true });
}