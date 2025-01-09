import { PlaywrightCrawler } from 'crawlee';
import { randomDelay, saveToFile } from '../../../utils/index.js';

// 创建 PlaywrightCrawler 实例
const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 60,
    headless: false,

    async requestHandler({ page, log }) {
        log.info('正在爬取掘金前端文章...');

        // 设置视窗大小
        await page.setViewportSize({ width: 1920, height: 1080 });

        // 修改 navigator.webdriver
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        // 等待文章列表加载
        await page.waitForSelector('.entry-list');

        // 模拟真实用户滚动行为
        let articleCount = 0;
        while (articleCount < 50) {
            // 随机滚动距离
            const scrollDistance = Math.floor(Math.random() * 300) + 200;
            await page.evaluate((distance) => {
                window.scrollBy(0, distance);
            }, scrollDistance);

            // 随机等待一段时间
            await randomDelay(800, 2000);

            // 获取当前文章数量
            articleCount = await page.$$eval('.entry-list .entry', elements => elements.length);

            // 如果滚动多次仍未获取足够文章，则退出循环
            if (articleCount >= 50 || await page.evaluate(() => {
                return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight;
            })) {
                break;
            }
        }

        // 提取文章信息
        const articles = await page.$$eval('.entry-list .entry', (elements) => {
            return elements.slice(0, 50).map(el => {
                const titleElement = el.querySelector('.title');
                const authorElement = el.querySelector('.user-name');
                const linkElement = el.querySelector('a.title-row');
                const briefElement = el.querySelector('.abstract');
                const metricElement = el.querySelector('.metric-item');
                const tagsElements = el.querySelectorAll('.tag-list .tag');

                return {
                    title: titleElement?.innerText?.trim() || '',
                    author: authorElement?.innerText?.trim() || '',
                    link: linkElement?.href || '',
                    brief: briefElement?.innerText?.trim() || '',
                    metrics: metricElement?.innerText?.trim() || '',
                    tags: Array.from(tagsElements).map(tag => tag.innerText.trim()),
                    timestamp: new Date().toISOString(),
                };
            });
        });

        // 随机等待后保存数据
        await randomDelay(1000, 2000);
        await saveToFile(articles, import.meta.url, 'frontend');
        log.info(`成功爬取 ${articles.length} 篇文章`);
    },
});

// 运行爬虫
try {
    await crawler.run(['https://juejin.cn/frontend']);
    console.log('爬取完成！');
} catch (error) {
    console.error('爬取过程中发生错误:', error);
}
