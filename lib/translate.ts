// Google Translate 비공식 API — API 키 불필요, 서버사이드 전용
export async function translateToKo(texts: string[]): Promise<string[]> {
  return Promise.all(
    texts.map(async (text) => {
      if (!text) return text;
      try {
        const res = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(text)}`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(4000),
          }
        );
        const data = await res.json();
        if (!Array.isArray(data?.[0])) return text;
        const translated = (data[0] as string[][]).map(seg => seg[0] ?? '').join('');
        return translated || text;
      } catch {
        return text; // 실패 시 원문 반환
      }
    })
  );
}
