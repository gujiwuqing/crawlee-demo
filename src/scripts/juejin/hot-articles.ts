import { PlaywrightCrawler } from 'crawlee';
import dayjs from 'dayjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const CONFIG = {
    url: 'https://juejin.cn/hot/articles',
    scrollTimes: 6,
    scrollDelay: 2000,
    outputDir: path.join(__dirname, 'hot'),
};

// 创建爬虫
const crawler = new PlaywrightCrawler({
    launchContext: {
        launchOptions: {
            headless: false,
        },
    },
    maxRequestsPerCrawl: 50,
    async requestHandler({ page, log }) {
        log.info('页面加载完成，开始处理...');

        // 滚动页面
        log.info('滚动加载内容...');
        for (let i = 0; i < CONFIG.scrollTimes; i++) {
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight);
            });
            await page.waitForTimeout(CONFIG.scrollDelay);
        }

        // 等待文章元素加载
        await page.waitForSelector('.article-item-link', { timeout: 10000 });

        log.info('开始采集文章信息...');
        // 提取文章信息
        const articles = await page.$$eval('.article-item-link', (links) =>
            links.map((link) => ({
                title: link.querySelector('.article-title').textContent.trim(),
                link: link.href,
                author: link.querySelector('.article-author-name-text').textContent.trim(),
                hotNumber: link.querySelector('.hot-number').textContent.trim(),
            }))
        );

        try {
            if (!fs.existsSync(CONFIG.outputDir)) {
                fs.mkdirSync(CONFIG.outputDir);
            }
    
            // 设置输出目录
            const dateDir = path.join(CONFIG.outputDir, dayjs().format('YYYY-MM-DD'));
            if (!fs.existsSync(dateDir)) {
                fs.mkdirSync(dateDir);
            }
    
        // 生成文件名（使用当前日期）
        const fileName = `hot-articles.json`;
        const filePath = path.join(dateDir, fileName);
            // 将数据保存为 JSON 文件
        fs.writeFileSync(filePath, JSON.stringify(articles, null, 2), 'utf-8');
        log.info(`数据已保存到 ${filePath}`);
        }
        catch (error) {
            console.error('An error occurred:', error);
        }
    }
});

// 主函数
export async function HotArticles() {
    await crawler.run([CONFIG.url]);
    console.log('采集数据完成');
}
