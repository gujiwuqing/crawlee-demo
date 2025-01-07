import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import { sleep, requestDownloadImage } from '../../utils/index.js'

// 图片保存路径
const today = dayjs().format('YYYY-MM-DD');
const downloadDir = path.resolve(`./kkmzt-detail-images/${today}`);
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}
console.log(`图片将保存到: ${downloadDir}`);

// 记录已访问的 URL
const visitedUrls = new Set();

// 主爬虫逻辑
const crawler = new PlaywrightCrawler({
    headless: false,
    maxConcurrency: 5,
    requestHandlerTimeoutSecs: 120,
    async requestHandler({ page, request, log }) {
        const detailUrl = request.url;  // 使用传入的请求 URL
        if (visitedUrls.has(detailUrl)) {
            log.info(`页面已访问过，跳过: ${detailUrl}`);
            return; // 如果已经访问过该页面，跳过
        }

        visitedUrls.add(detailUrl); // 标记该页面已访问
        log.info(`访问详情页: ${detailUrl}`);

        // 滚动加载所有内容
        log.info('滚动加载内容...');
        await page.evaluate(async () => {
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            for (let i = 0; i < 4; i++) {
                window.scrollBy(0, window.innerHeight);
                await delay(1000);
            }
        });

        log.info('等待 .uk-container 加载...');
        await page.waitForSelector('.uk-container', { timeout: 10000 });

        // 调用详情页爬取逻辑
        await scrapeDetailPage(page, log);
    },
});

const scrapeDetailPage = async (page, log) => {
    const downloadedImages = new Set();
    let hasNext = true;

    while (hasNext) {
        // 获取当前图片的 URL
        const currentImage = await page.evaluate(() => {
            const imgElement = document.querySelector('figure.uk-inline img');
            return imgElement ? imgElement.src : null;
        });

        if (currentImage && !downloadedImages.has(currentImage)) {
            downloadedImages.add(currentImage);

            const imageName = currentImage.split('/').pop();
            const imagePath = path.join(downloadDir, imageName);

            try {
                // 下载图片
                log.info(`正在下载: ${imagePath}`);
                await requestDownloadImage(currentImage, imagePath);
                log.info(`图片下载成功: ${imagePath}`);
            } catch (error) {
                log.error(`下载失败: ${currentImage}, 错误原因: ${error.message}`);
            }
        }

        // 随机延时 2-3 秒
        const delay = Math.random() * 1000 + 2000;
        log.info(`等待 ${delay.toFixed(0)} 毫秒...`);
        await sleep(delay);

        // 滚动到“下一页”按钮
        await page.evaluate(() => {
            const nextButton = document.querySelector('div.f-swich[action="next"]');
            if (nextButton) {
                nextButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });

        // 点击下一页并等待页面加载
        hasNext = await page.evaluate(() => {
            const nextButton = document.querySelector('div.f-swich[action="next"]');
            if (nextButton) {
                nextButton.click();
                return true;
            }
            return false;
        });

        // 等待页面加载完成
        await sleep(3000);

        // 等待图片加载完成
        await sleep(2000);
    }
};

(async () => {
    const baseUrl = 'https://kkmzt.com/photo/59028';
    await crawler.run([{ url: baseUrl }]);
    console.log('所有数据爬取完成！');
})();