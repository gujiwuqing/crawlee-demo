//爬取第三方网站获取微博热搜
import { PlaywrightCrawler } from 'crawlee';
import { randomDelay, saveToFile } from '../../../utils/index.js';
import dayjs from 'dayjs';

const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 60,
    headless: false,

    async requestHandler({ page, log }) {
        log.info('正在爬取微博热榜数据...');

        // 等待页面加载完成
        await page.waitForLoadState('networkidle');

        // 等待热榜表格加载
        await page.waitForSelector('.table tbody tr', { timeout: 10000 });


        // 优化滚动逻辑，使其更自然
        log.info('开始缓慢滚动页面...');
        const scrollStep = 100; // 每次滚动100像素
        const scrollDelay = async () => await randomDelay(300, 500); // 每次滚动间隔300-500ms

        // 模拟真实用户的滚动行为
        for (let i = 0; i < 20; i++) { // 增加滚动次数，但每次滚动距离减小
            await page.evaluate((step) => {
                window.scrollBy(0, step);
            }, scrollStep);

            // 随机暂停一下，模拟用户查看内容
            if (i % 5 === 0) {
                await randomDelay(1500, 2500);
                log.info(`已滚动 ${i * scrollStep} 像素...`);
            } else {
                await scrollDelay();
            }
        }

        // 最后再等待一会，确保所有内容都加载完成
        await randomDelay(2000, 3000);

        // 获取热榜数据
        const hotTopics = await page.evaluate(() => {
            const rows = document.querySelectorAll('.table tbody tr');
            return Array.from(rows).map(row => {
                // 获取排名
                const rankElement = row.querySelector('td:first-child');
                const rank = rankElement?.innerText?.trim().replace('.', '');

                // 获取标题和链接
                const titleElement = row.querySelector('td.al a');
                const title = titleElement?.innerText?.trim();
                const link = titleElement?.href;

                // 获取热度
                const hotElement = row.querySelector('td:nth-child(3)');
                let hot = hotElement?.innerText?.trim();

                // 处理热度数据
                if (hot) {
                    // 如果包含空格，说明可能有分类信息
                    if (hot.includes(' ')) {
                        const parts = hot.split(' ');
                        hot = {
                            category: parts[0],
                            value: parts[1]
                        };
                    } else {
                        hot = {
                            value: hot
                        };
                    }
                }

                return {
                    rank,
                    title,
                    link,
                    hot,
                };
            });
        });

        // 过滤掉无效数据
        const validTopics = hotTopics.filter(topic => topic.title && topic.rank);

        // 构建结果对象
        const results = {
            timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            total: validTopics.length,
            topics: validTopics.map(topic => ({
                ...topic,
                platform: '微博',
                crawlTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
            }))
        };

        log.info(`获取到 ${results.total} 条热搜数据`);

        // 保存数据
        await saveToFile(results, import.meta.url, 'weibo-hot');
        log.info('微博热榜数据爬取完成！');

        return results;
    },
});

// 运行爬虫
try {
    await crawler.run(['https://tophub.today/n/KqndgxeLl9']);
    console.log('爬取完成！');
} catch (error) {
    console.error('爬取过程中发生错误:', error);
}
