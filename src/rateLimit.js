// Token bucket in Redis; Lua keeps check+refill+take atomic across gateway instances.
// If API_KEYS is set (comma-separated), only those keys are accepted, so callers cannot dodge
// the limit by inventing a new key for every request.
const LUA = `
local k, cap, rate, now = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local s = redis.call('HMGET', k, 't', 'ts')
local t, ts = tonumber(s[1]) or cap, tonumber(s[2]) or now
t = math.min(cap, t + (now - ts) * rate / 1000)
local ok = 0
if t >= 1 then t = t - 1; ok = 1 end
redis.call('HSET', k, 't', t, 'ts', now)
redis.call('EXPIRE', k, 3600)
return ok`;

export const rateLimit = (redis, cap = 10, perSec = 1) => async (req, res, next) => {
  const key = req.get('x-api-key');
  if (!key) return res.status(401).json({ error: 'x-api-key header required' });
  const allowed = process.env.API_KEYS ? process.env.API_KEYS.split(',').map((s) => s.trim()) : null;
  if (allowed && !allowed.includes(key)) return res.status(401).json({ error: 'invalid api key' });
  req.userKey = key;
  const ok = await redis.eval(LUA, 1, `rl:${key}`, cap, perSec, Date.now());
  if (!ok) return res.status(429).json({ error: 'rate limit exceeded' });
  next();
};