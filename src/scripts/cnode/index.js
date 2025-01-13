import { PlaywrightCrawler } from 'crawlee';
import { randomDelay, saveToFile } from '../../../utils/index.js';

// 创建 PlaywrightCrawler 实例
const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 60,
    headless: false,

    async requestHandler({ page, log, request }) {
        const currentPage = request.userData?.page || 1;
        log.info(`正在爬取 CNode 第 ${currentPage} 页文章...`);

        // 设置视窗大小
        await page.setViewportSize({ width: 1920, height: 1080 });

        // 修改 navigator.webdriver
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        // 等待文章列表加载
        await page.waitForSelector('#topic_list');

        // 模拟真实用户浏览行为
        let previousHeight = 0;
        const maxScrolls = Math.floor(Math.random() * 3) + 3; // 随机滚动3-5次
        
        for (let i = 0; i < maxScrolls; i++) {
            // 随机滚动距离
            const scrollDistance = Math.floor(Math.random() * 300) + 200;
            await page.evaluate((distance) => {
                window.scrollBy(0, distance);
            }, scrollDistance);

            // 随机移动鼠标
            const x = Math.floor(Math.random() * 800);
            const y = Math.floor(Math.random() * 600);
            await page.mouse.move(x, y);

            // 有20%的概率点击一下（避开链接）
            if (Math.random() < 0.2) {
                await page.mouse.click(x, y);
            }

            // 随机等待一段时间
            await randomDelay(800, 2000);

            // 获取当前页面高度
            const currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
            if (currentHeight === previousHeight) {
                break;
            }
            previousHeight = currentHeight;
        }

        // 最后滚动到底部
        await page.evaluate(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
        });
        await randomDelay(500, 1000);

        // 提取文章信息
        const articles = await page.$$eval('#topic_list .cell', (elements) => {
            return elements.map(el => {
                const titleElement = el.querySelector('.topic_title');
                const authorElement = el.querySelector('.user_avatar img');
                const countElement = el.querySelector('.count_of_replies');
                const visitCountElement = el.querySelector('.count_of_visits');
                const lastTimeElement = el.querySelector('.last_active_time');
                const tabElement = el.querySelector('.tab');

                return {
                    title: titleElement?.textContent?.trim() || '',
                    link: titleElement?.href || '',
                    author: authorElement?.title || '',
                    avatar: authorElement?.src || '',
                    replies: countElement?.textContent?.trim() || '0',
                    visits: visitCountElement?.textContent?.trim() || '0',
                    lastReplyTime: lastTimeElement?.textContent?.trim() || '',
                    tab: tabElement?.textContent?.trim() || '',
                    source: 'cnode',
                    timestamp: new Date().toISOString(),
                };
            });
        });

        // 保存数据
        await saveToFile(articles, import.meta.url, `page-${currentPage}`);
        log.info(`成功爬取第 ${currentPage} 页，共 ${articles.length} 篇文章`);

        // 判断是否需要继续爬取下一页
        const maxPages = request.userData?.maxPages || 1;
        if (currentPage < maxPages) {
            // 随机等待较长时间再访问下一页
            await randomDelay(2000, 4000);
            
            // 获取下一页链接
            const nextPageUrl = `https://cnodejs.org/?page=${currentPage + 1}`;
            await crawler.addRequests([{
                url: nextPageUrl,
                userData: {
                    page: currentPage + 1,
                    maxPages,
                },
            }]);
        }
    },
});

// 设置爬取页数并运行爬虫
const MAX_PAGES = 2; // 设置要爬取的页数

const cnodeArticles = {
    async run() {
        try {
            await crawler.run([{
                url: 'https://cnodejs.org/',
                userData: {
                    page: 1,
                    maxPages: MAX_PAGES,
                },
            }]);
        } catch (error) {
            console.error('爬取过程中发生错误:', error);
            throw error; // 向上传递错误
        }
    }
};

export default cnodeArticles;
