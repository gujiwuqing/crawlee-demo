// 官方热搜榜 但是爬取的数据不完善有问题
import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';
import path from 'path';
import { randomDelay, saveToFile } from '../../../utils/index.js';

const CONFIG = {
    baseUrl: 'https://m.weibo.cn/',
    outputDir: path.join(process.cwd(), 'weibo-hot'),
};

const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

const crawler = new PlaywrightCrawler({
    launchContext: {
        launchOptions: {
            headless: false, // 调试时设为 false
        },
    },
    async requestHandler({ page, log }) {
        try {
            log.info('开始访问微博首页...');
            await page.goto(CONFIG.baseUrl);

            // 点击搜索框
            log.info('点击搜索框...');
            const searchButtonSelector = 'a.nav-search'; // 首页搜索按钮
            await page.click(searchButtonSelector);
            await page.waitForNavigation();

            // 点击“微博热搜榜”
            log.info('进入搜索页面，准备点击微博热搜榜...');
            const hotSearchSelector = '//h4[contains(text(), "微博热搜榜")]/ancestor::div[contains(@class, "m-item-box")]';
            const hotSearchElement = await page.waitForSelector(hotSearchSelector, { timeout: 10000 });
            await hotSearchElement.click();

            // 确认已进入热搜榜页面
            log.info('进入热搜榜页面，等待数据加载...');
            await page.waitForSelector('.m-container-max', { timeout: 10000 });

            // 采集热搜榜数据
            log.info('开始采集热搜榜数据...');
            // 滚动页面
            log.info('开始缓慢滚动页面...');
            const scrollStep = 100;
            for (let i = 0; i < 15; i++) {
                await page.evaluate((step) => {
                    window.scrollBy(0, step);
                }, scrollStep);

                if (i % 5 === 0) {
                    await randomDelay(800, 1200);
                    log.info(`已滚动 ${i * scrollStep} 像素...`);
                } else {
                    await randomDelay(200, 400);
                }
            }
            const hotSearchItems = await page.$$eval('.card-list .m-panel', (items) =>
                items.map((item, index) => ({
                    rank: index + 1,
                    title: item.querySelector('.main-text')?.textContent.trim() || '未命名',
                    heat: item.querySelector('.sub-text')?.textContent.trim() || '未知热度',
                    // link: item.querySelector('.main-title')?.href || '',
                }))
            );

            if (hotSearchItems.length === 0) {
                log.info('未采集到任何数据，请检查页面结构或选择器！');
            } else {
                log.info(`采集到 ${hotSearchItems.length} 条热搜数据`);
            }

            // 保存数据
            await saveToFile(hotSearchItems, import.meta.url, 'weibo-hot');
        } catch (error) {
            log.error('爬取过程中发生错误:', error);
            if (page) {
                const screenshot = await page.screenshot({ fullPage: true });
                const screenshotPath = `error-screenshot-${Date.now()}.png`;
                fs.writeFileSync(screenshotPath, screenshot);
                log.error(`页面截图已保存至: ${screenshotPath}`);
            }
            throw error;
        }
    },
    failedRequestHandler({ request, error }) {
        console.error(`处理请求 ${request.url} 时出错:`, error);
    },
});

// 主函数
(async () => {
    console.log('开始爬取微博热搜榜数据...');
    await crawler.run([{ url: CONFIG.baseUrl }]);
    console.log('微博热搜榜数据爬取完成！');
})();