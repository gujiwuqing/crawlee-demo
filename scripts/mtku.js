import { PlaywrightCrawler, Dataset } from 'crawlee';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

// 图片保存路径
const downloadDir = path.resolve('./mtku-images');
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir);
}

// 图片下载函数
const downloadImage = async (url, filepath) => {
    const writer = fs.createWriteStream(filepath);
    // 添加 User-Agent 和 Referer 请求头
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.mtku.net/' // 确保 Referer 是正确的，防止被拒绝
    };
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
};

// 主爬虫逻辑
const crawler = new PlaywrightCrawler({
    headless: false,
    maxConcurrency: 5, // 并发数
    requestHandlerTimeoutSecs: 120, // 设置超时时间
    async requestHandler({ page, request, log }) {
        log.info(`正在访问页面: ${request.url}`);
        await page.waitForSelector('.container', { timeout: 10000 });

        // 滚动加载更多内容
        log.info('滚动加载内容...');
        await page.evaluate(async () => {
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            for (let i = 0; i < 5; i++) {
                window.scrollBy(0, window.innerHeight);
                await delay(1000);
            }
        });

        // 提取图片信息
        log.info('提取图片信息...');
        const images = await page.evaluate(() => {

            const elements = Array.from(document.querySelectorAll('.taotu-img'));
            return elements.map((el, index) => {
                const imageUrl = el.querySelector('.taotu-a img')?.getAttribute('src') || '';
                const title = el.querySelector('.taotu-a img')?.getAttribute('alt') || `未命名${index}`;
                return { imageUrl, title };
            });
        });

        if (images.length === 0) {
            log.warning('未找到符合条件的图片数据！');
            return;
        }
        log.info('images', images)
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
            await new Promise((res) => setTimeout(res, 2000)); // 下载间隔，避免被封
        }
    },
    failedRequestHandler({ request, error, log }) {
        log.error(`请求失败: ${request.url}, 错误: ${error.message}`);
    },
});

(async () => {
    const baseUrl = 'https://www.mtku.net/';
    await crawler.run([{ url: baseUrl }]);
    console.log('所有图片下载完成！');
})();