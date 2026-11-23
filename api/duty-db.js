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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 自動偵測 Vercel KV / Upstash Redis 環境變數
  const envKeys = Object.keys(process.env);
  const urlKey = envKeys.find(k => k.endsWith('_REST_API_URL'));
  const tokenKey = envKeys.find(k => k.endsWith('_REST_API_TOKEN'));

  const redisUrl = urlKey ? process.env[urlKey] : null;
  const redisToken = tokenKey ? process.env[tokenKey] : null;

  if (!redisUrl || !redisToken) {
    return res.status(500).json({
      error: 'Vercel 尚未載入 Redis 環境變數，請在 Vercel Storage 連結 KV / Upstash Redis 並重新部署。'
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
        return res.status(502).json({ error: result.error || '讀取 Redis 雲端資料失敗' });
      }
      if (!result.result) {
        return res.status(200).json({
          dutyList: {},
          weeks: {},
          medicalStaffStore: { byDateSlot: {}, doctorHistory: [], nurseHistory: [], updatedAtByKey: {} }
        });
      }
      const parsedData = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
      return res.status(200).json(parsedData);
    }

    if (req.method === 'POST') {
      const payload = req.body;
      if (!payload || (!payload.dutyList && !payload.weeks && !payload.medicalStaffStore)) {
        return res.status(400).json({ error: '無效的更期或醫護資料格式' });
      }

      // 若為局部更新（例如僅更新大夫與姑娘卡片），先讀取現有雲端資料合併，避免覆蓋更期表
      let finalPayload = payload;
      if (payload.partialMedicalOnly) {
        const getRes = await fetch(`${redisUrl}/get/${DB_KEY}`, {
          headers: { Authorization: `Bearer ${redisToken}` },
        });
        const getJson = await getRes.json().catch(() => ({}));
        const existing = getJson && getJson.result
          ? (typeof getJson.result === 'string' ? JSON.parse(getJson.result) : getJson.result)
          : {};
        finalPayload = {
          ...existing,
          medicalStaffStore: payload.medicalStaffStore,
          updatedAt: payload.updatedAt || new Date().toISOString()
        };
      }

      const response = await fetch(`${redisUrl}/set/${DB_KEY}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalPayload),
      });

      const result = await response.json();
      if (!response.ok) {
        return res.status(502).json({ error: result.error || '寫入 Redis 雲端資料失敗' });
      }
      return res.status(200).json({
        ok: true,
        updatedAt: finalPayload.updatedAt || new Date().toISOString()
      });
    }

    return res.status(405).json({ error: '不支援的請求方法' });
  } catch (err) {
    return res.status(500).json({ error: err.message || '伺服器內部錯誤' });
  }
}
