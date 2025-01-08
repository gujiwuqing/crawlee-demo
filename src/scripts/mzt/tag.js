import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import { downloadImage } from '../../utils/index.js'

// 图片保存路径
const date = dayjs().format('YYYY-MM-DD');
const downloadDir = path.resolve(`./kkmzt-tag-images/${date}`);
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}

// 主爬虫逻辑
const crawler = new PlaywrightCrawler({
    headless: false,
    maxConcurrency: 5, // 并发数
    requestHandlerTimeoutSecs: 120, // 请求超时
    async requestHandler({ page, request, log }) {
        log.info(`正在访问页面: ${request.url}`);
        await page.waitForSelector('.uk-container', { timeout: 10000 });

        // 滚动加载更多内容
        log.info('滚动加载内容...');
        await page.evaluate(async () => {
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            for (let i = 0; i < 10; i++) {
                window.scrollBy(0, window.innerHeight);
                await delay(1000);
            }
        });

        // 提取图片信息
        log.info('提取图片信息...');
        const images = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('.uk-card'));
            return elements.map((el) => {
                const imageUrl = el.querySelector('.uk-card-media-top img')?.getAttribute('src') || '';
                const title = el.querySelector('.uk-card-title a')?.innerText || '未命名';
                const detailUrl = el.querySelector('.uk-card-title a')?.getAttribute('href') || '';
                return { imageUrl, title, detailUrl };
            });
        });

        if (images.length === 0) {
            log.warning('未找到符合条件的图片数据！');
            return;
        }

        log.info(`发现图片 ${images.length} 张，开始下载...`);

        // 下载图片
        for (let i = 0; i < images.length; i++) {
            const { title, imageUrl } = images[i];
            if (!imageUrl.startsWith('http')) {
                log.warning(`跳过无效图片地址: ${imageUrl}`);
                continue;
            }

            const filename = `${title || `image_${i + 1}`}.jpg`.replace(/[\/:*?"<>|]/g, '_');
            const filepath = path.join(downloadDir, filename);

            log.info(`正在下载: ${filename}, 地址: ${imageUrl}`);
            try {
                await downloadImage(imageUrl, filepath);
            } catch (error) {
                log.error(`图片下载失败: ${imageUrl}, 错误: ${error.message}`);
            }
            await new Promise((res) => setTimeout(res, 2000)); // 下载间隔
        }
    },
    failedRequestHandler({ request, error, log }) {
        log.error(`请求失败: ${request.url}, 错误: ${error.message}`);
    },
});

(async () => {
    const baseUrl = 'https://kkmzt.com/photo/tag/youwu/';
    await crawler.run([{ url: baseUrl }]);
    console.log('所有图片下载完成！');
})();