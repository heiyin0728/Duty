// api/duty-db.js
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 自動偵測 Vercel KV / Upstash Redis 環境變數（含自訂前綴）
  const envKeys = Object.keys(process.env);
  const urlKey = envKeys.find(k => k.endsWith('KV_REST_API_URL') || k.endsWith('UPSTASH_REDIS_REST_URL'));
  const tokenKey = envKeys.find(k => k.endsWith('KV_REST_API_TOKEN') || k.endsWith('UPSTASH_REDIS_REST_TOKEN'));

  const redisUrl = urlKey ? process.env[urlKey] : '';
  const redisToken = tokenKey ? process.env[tokenKey] : '';

  if (!redisUrl || !redisToken) {
    return res.status(500).json({
      error: 'Vercel 尚未載入 Redis 環境變數，請在 Vercel Deployments 按 Redeploy',
    });
  }

  const DB_KEY = 'qeh_aed_duty_list_master_v2';

  try {
    if (req.method === 'GET') {
      const response = await fetch(`${redisUrl}/get/${DB_KEY}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      });
      const result = await response.json();
      if (!response.ok) {
        return res.status(502).json({ error: '讀取 Upstash 失敗', detail: result });
      }
      if (!result.result) {
        return res.status(200).json({ dutyList: null, message: '雲端目前尚無數據' });
      }
      const parsedData = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
      return res.status(200).json(parsedData);
    }

    if (req.method === 'POST') {
      const payload = req.body;
      if (!payload || (!payload.dutyList && !payload.weeks)) {
        return res.status(400).json({ error: '缺少有效的 DutyList 數據' });
      }

      const response = await fetch(`${redisUrl}/set/${DB_KEY}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        return res.status(502).json({ error: '寫入 Upstash 失敗', detail: result });
      }
      return res.status(200).json({ ok: true, updatedAt: payload.updatedAt });
    }

    return res.status(405).json({ error: '不支援的請求方法' });
  } catch (err) {
    return res.status(500).json({ error: err.message || '伺服器內部錯誤' });
  }
}
