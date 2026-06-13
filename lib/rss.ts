export interface RSSItem {
  guid: string;
  title: string;
  description: string;
  link: string;
  pubTime: number;
  publisher: string;
}

const DOMAIN_MAP: Record<string, string> = {
  'fool.com':              'Motley Fool',
  '247wallst.com':         '247 Wall St',
  'reuters.com':           'Reuters',
  'bloomberg.com':         'Bloomberg',
  'wsj.com':               'Wall Street Journal',
  'cnbc.com':              'CNBC',
  'marketwatch.com':       'MarketWatch',
  'businessinsider.com':   'Business Insider',
  'finance.yahoo.com':     'Yahoo Finance',
  'yahoo.com':             'Yahoo Finance',
  'investopedia.com':      'Investopedia',
  'seekingalpha.com':      'Seeking Alpha',
  'barrons.com':           "Barron's",
  'ft.com':                'Financial Times',
  'thestreet.com':         'TheStreet',
  'techcrunch.com':        'TechCrunch',
  'forbes.com':            'Forbes',
  'fortune.com':           'Fortune',
  'economist.com':         'The Economist',
  'nytimes.com':           'New York Times',
  'washingtonpost.com':    'Washington Post',
  'apnews.com':            'AP News',
  'detroitfreepress.com':  'Detroit Free Press',
  'hankyung.com':          '한국경제',
  'mk.co.kr':              '매일경제',
  'chosun.com':            '조선일보',
  'joins.com':             '중앙일보',
};

function publisherFromURL(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    for (const [domain, name] of Object.entries(DOMAIN_MAP)) {
      if (host === domain || host.endsWith('.' + domain)) return name;
    }
    // 도메인 자체를 표시 (예: 247wallst.com → 247wallst)
    return host.split('.').slice(-2, -1)[0] ?? host;
  } catch {
    return '';
  }
}

function extractTag(block: string, tag: string): string {
  const cdata = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
  if (cdata) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  if (plain) return plain[1].trim();
  return '';
}

function stripHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchYahooRSS(symbol: string): Promise<RSSItem[]> {
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    const xml = await res.text();
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

    return blocks.map(block => {
      const guid = extractTag(block, 'guid') || extractTag(block, 'link');
      const title = stripHTML(extractTag(block, 'title'));
      const description = stripHTML(extractTag(block, 'description'));
      const link = extractTag(block, 'link');
      const pubDateStr = extractTag(block, 'pubDate');
      return {
        guid,
        title,
        description,
        link,
        pubTime: pubDateStr ? Math.floor(new Date(pubDateStr).getTime() / 1000) : 0,
        publisher: publisherFromURL(link),
      };
    }).filter(i => i.title && i.guid);
  } catch {
    return [];
  }
}
