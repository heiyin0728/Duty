export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getAvailableModels(apiKey) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.models)) return null;

    // 篩選支援 generateContent 且為 gemini 系列的模型，排除舊版 2.0/1.5 與專用模型
    const valid = data.models
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          m.name.includes('gemini') &&
          !m.name.includes('gemini-2.0') &&
          !m.name.includes('gemini-1.') &&
          !m.name.includes('embedding') &&
          !m.name.includes('imagen') &&
          !m.name.includes('veo')
      )
      .map((m) => m.name.replace(/^models\//, ''));

    // 優先排序最新的 flash 模型，其次 pro 模型
    valid.sort((a, b) => {
      const score = (n) => (n.includes('flash') ? 2 : 0) + (n.includes('3.') ? 1 : 0);
      return score(b) - score(a);
    });

    return valid.length ? valid : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64, prompt, apiKey } = req.body || {};
    if (!imageBase64 || !apiKey) {
      return res.status(400).json({ error: '缺少圖片資料或 API Key' });
    }

    // 自動取得你帳號目前可用的最新模型清單，失敗時退回預設清單
    const dynamicModels = await getAvailableModels(apiKey);
    const models = dynamicModels || ['gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-2.5-pro'];
    let lastErr = '';

    for (const model of models) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.0,
              responseMimeType: 'application/json',
            },
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          return res.status(200).json({ text: data.candidates[0].content.parts[0].text });
        }

        lastErr = `[${model}] ${data.error?.message || `HTTP ${response.status}`}`;
        if (response.status === 503 || response.status === 429 || lastErr.includes('high demand')) {
          await sleep(2500);
        } else {
          break;
        }
      }
    }

    return res.status(502).json({ error: lastErr || '所有可用模型均忙碌中，請稍後再試' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
