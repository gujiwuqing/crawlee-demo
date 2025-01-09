import { PlaywrightCrawler, sleep } from 'crawlee';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import { requestDownloadImage } from '../../../utils/index.js'


const downloadDir = path.resolve(`./kkmzt-detail-images/${dayjs().format('YYYY-MM-DD')}`);

// 确保保存目录存在
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}
console.log(`图片将保存到: ${downloadDir}`);

// 详情页爬取逻辑
const scrapeDetailPage = async ({ page, log }) => {
    const downloadedImages = new Set();
    let hasNext = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    while (hasNext) {
        try {
            // 等待图片元素加载
            await page.waitForSelector('figure.uk-inline img', { timeout: 5000 });

            const currentImage = await page.evaluate(() => {
                const imgElement = document.querySelector('figure.uk-inline img');
                return imgElement ? imgElement.src : null;
            });

            if (currentImage && !downloadedImages.has(currentImage)) {
                downloadedImages.add(currentImage);
                const imageName = path.basename(currentImage);
                const imagePath = path.join(downloadDir, imageName);

                // 添加重试机制
                await requestDownloadImage(currentImage, imagePath).catch(async (error) => {
                    log.error(`下载失败: ${error.message}, 重试中...`);
                    await sleep(2000);
                    return requestDownloadImage(currentImage, imagePath);
                });

                // 使用随机延时范围
                const delay = Math.random() * 2000 + 1500; // 1.5-3.5秒
                log.info(`等待 ${delay.toFixed(0)} 毫秒...`);
                await sleep(delay);
            }

            // 滚动到"下一页"按钮
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

            await sleep(3000);
        } catch (error) {
            retryCount++;
            if (retryCount >= MAX_RETRIES) {
                log.error(`重试${MAX_RETRIES}次后仍然失败，跳过当前页面`);
                break;
            }
            log.warn(`出错: ${error.message}, 重试第${retryCount}次`);
            await sleep(2000);
            continue;
        }
    }
};

// 主爬取逻辑
const crawler = new PlaywrightCrawler({
    headless: false,
    maxConcurrency: 2,
    requestHandlerTimeoutSecs: 300,
    retryOnBlocked: true,
    navigationTimeoutSecs: 60,
    browserPoolOptions: {
        useFingerprints: true,
    },
    async requestHandler({ page, request, log }) {
        // 添加随机用户代理
        await page.setExtraHTTPHeaders({
            'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/${Math.floor(Math.random() * 100 + 500)}.36`,
        });

        const tagPageUrl = request.url;
        log.info(`访问页面: ${tagPageUrl}`);

        const currentDate = dayjs().format('YYYY-MM-DD');

        // 优化滚动加载
        log.info('滚动加载内容...');
        await page.evaluate(async () => {
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const scrollHeight = document.documentElement.scrollHeight;
            let currentPosition = 0;
            while (currentPosition < scrollHeight) {
                window.scrollBy(0, 200);
                currentPosition += 200;
                await delay(500);
            }
        });

        // 提取符合条件的链接
        log.info('提取符合条件的链接...');
        const links = await page.evaluate((date) => {
            const elements = Array.from(document.querySelectorAll('.uk-card'));
            return elements
                .filter((item) => {
                    const timeTag = item.querySelector('time');
                    return timeTag && timeTag.innerText.trim().startsWith(date);
                })
                .map((item) => {
                    const linkElement = item.querySelector('a');
                    return linkElement ? linkElement.href : null;
                })
                .filter(Boolean);
        }, currentDate);

        log.info(`找到符合条件的链接: ${links.length} 个`);

        // 遍历每个链接并爬取详情页
        for (const link of links) {
            log.info(`访问详情页: ${link}`);
            await page.goto(link, { waitUntil: 'networkidle' });
            await scrapeDetailPage({ page, log });
        }
    },
});

// 主函数
(async () => {
    try {
        console.log('启动爬虫...');
        await crawler.run(['https://kkmzt.com/photo/']);
        console.log('爬取完成!');
    } catch (error) {
        process.exit(1);
    }
})();