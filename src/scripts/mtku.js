import { PlaywrightCrawler } from 'crawlee';
import path from 'path';
import { ensureDir, requestDownloadImage, randomDelay } from '../../utils/index.js';

// 创建图片保存目录
const downloadDir = path.resolve('./mtku-images');
await ensureDir(downloadDir);

// 主爬虫逻辑
const crawler = new PlaywrightCrawler({
    headless: false,
    maxConcurrency: 5,
    requestHandlerTimeoutSecs: 120,

    async requestHandler({ page, request, log }) {
        log.info(`正在访问页面: ${request.url}`);

        // 等待内容加载
        await page.waitForSelector('.container', { timeout: 10000 });

        // 模拟滚动加载
        log.info('滚动加载内容...');
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await randomDelay(800, 1200); // 使用随机延迟
        }

        // 提取图片信息
        log.info('提取图片信息...');
        const images = await page.$$eval('.taotu-img', (elements) => {
            return elements.map((el, index) => ({
                imageUrl: el.querySelector('.taotu-a img')?.getAttribute('src') || '',
                title: el.querySelector('.taotu-a img')?.getAttribute('alt') || `未命名${index}`,
            }));
        });

        if (images.length === 0) {
            log.warning('未找到符合条件的图片数据！');
            return;
        }

        log.info(`发现 ${images.length} 张图片，开始下载...`);

        // 下载图片
        for (const { title, imageUrl } of images) {
            if (!imageUrl.startsWith('http')) {
                log.warning(`跳过无效图片地址: ${imageUrl}`);
                continue;
            }

            const filename = `${title || `image_${Date.now()}`}.jpg`.replace(/[\/:*?"<>|]/g, '_');
            const filepath = path.join(downloadDir, filename);

            log.info(`正在下载: ${filename}`);
            try {
                await requestDownloadImage(imageUrl, filepath);
                await randomDelay(1500, 2500); // 下载间隔使用随机延迟
            } catch (error) {
                log.error(`图片下载失败: ${imageUrl}, 错误: ${error.message}`);
            }
        }
    },

    // 失败请求处理
    failedRequestHandler({ request, error, log }) {
        log.error(`请求失败: ${request.url}, 错误: ${error.message}`);
    },
});

// 运行爬虫
try {
    const baseUrl = 'https://www.mtku.net/';
    await crawler.run([baseUrl]);
    console.log('所有图片下载完成！');
} catch (error) {
    console.error('爬虫运行出错:', error);
}