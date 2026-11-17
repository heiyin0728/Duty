export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64, prompt, apiKey } = req.body || {};
    if (!imageBase64 || !apiKey) {
      return res.status(400).json({ error: '缺少圖片資料或 API Key' });
    }

    const models = ['gemini-3.8-flash', 'gemini-2.5-flash'];
    let lastErr = '';

    for (const model of models) {
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
      lastErr = data.error?.message || `HTTP ${response.status}`;
    }

    return res.status(502).json({ error: lastErr || 'Google API 呼叫失敗' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
