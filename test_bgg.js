import * as cheerio from 'cheerio';

async function test() {
    const query = "splendor";
    // Test Game Details Scraping for Splendor (148228)
    const gameId = "148228";
    const detailsUrl = `https://boardgamegeek.com/boardgame/${gameId}`;
    
    console.log(`Fetching details from ${detailsUrl}...`);
    const detailsResponse = await fetch(detailsUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    });
    
    const detailsHtml = await detailsResponse.text();
    const $d = cheerio.load(detailsHtml);
    
    // Look for JSON-LD
    const jsonLd = $d('script[type="application/ld+json"]').html();
    if (jsonLd) {
        console.log("Found JSON-LD:");
        console.log(jsonLd.substring(0, 500));
    }

    // Look for GEEK.geekitemPreload
    const scripts = $d('script').map((i, el) => $d(el).html()).get();
    const preloadScript = scripts.find(s => s && s.includes('GEEK.geekitemPreload'));
    if (preloadScript) {
        console.log("Found GEEK.geekitemPreload script!");
        // Extract JSON
        const match = preloadScript.match(/GEEK\.geekitemPreload\s*=\s*({.*?});/s);
        if (match) {
            console.log("Extracted Preload JSON (preview):");
            // console.log(match[1].substring(0, 200));
            
            try {
                const data = JSON.parse(match[1]);
                const item = data.item;
                
                console.log("Direct minplayers:", item.minplayers);
                console.log("Direct maxplayers:", item.maxplayers);
                console.log("Direct minplaytime:", item.minplaytime);
                console.log("Direct maxplaytime:", item.maxplaytime);
                console.log("Direct minage:", item.minage);
                console.log("Direct description:", item.description ? "Found" : "Not Found");
                console.log("Direct short_description:", item.short_description ? "Found" : "Not Found");
                console.log("Direct body:", item.body ? "Found" : "Not Found");

                if (item.polls && item.polls.userplayers) {
                    console.log("User Players Poll:", JSON.stringify(item.polls.userplayers, null, 2).substring(0, 200));
                }

            } catch (e) {
                console.error("JSON Parse Error:", e);
            }
        }
    }
}

test();
test();
