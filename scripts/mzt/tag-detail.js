import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dayjs from 'dayjs';
import { sleep, requestDownloadImage } from '../../utils/index.js'

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

    while (hasNext) {
        // 获取当前图片的 URL
        const currentImage = await page.evaluate(() => {
            const imgElement = document.querySelector('figure.uk-inline img');
            return imgElement ? imgElement.src : null;
        });

        if (currentImage && !downloadedImages.has(currentImage)) {
            downloadedImages.add(currentImage);

            const imageName = path.basename(currentImage);
            const imagePath = path.join(downloadDir, imageName);

            await requestDownloadImage(currentImage, imagePath);

            // 随机延时 2-3 秒
            const delay = Math.random() * 1000 + 2000;
            log.info(`等待 ${delay.toFixed(0)} 毫秒...`);
            await sleep(delay);
        }

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
    }
};

// 主爬取逻辑
const crawler = new PlaywrightCrawler({
    headless: false, // 设置为 false 以便调试时查看浏览器
    maxConcurrency: 3, // 最大并发任务数
    requestHandlerTimeoutSecs: 180, // 设置超时时间为 180 秒
    async requestHandler({ page, request, log }) {
        const tagPageUrl = request.url;
        log.info(`访问页面: ${tagPageUrl}`);

        const currentDate = '2025-01-01' || dayjs().format('YYYY-MM-DD'); // 使用当前日期

        // 滚动加载所有内容
        log.info('滚动加载内容...');
        await page.evaluate(async () => {
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            for (let i = 0; i < 2; i++) {
                window.scrollBy(0, window.innerHeight);
                await delay(1000);
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
                .filter(Boolean); // 过滤掉无效链接
        }, currentDate);

        log.info(`找到符合条件的链接: ${links.length} 个`);

        // 遍历每个链接并爬取详情页
        for (const link of links) {
            log.info(`访问详情页: ${link}`);
            await page.goto(link, { waitUntil: 'networkidle' });

            // 滚动到页面底部并调用详情页逻辑
            await scrapeDetailPage({ page, log });
        }
    },
});

(async () => {
    console.log('启动爬虫...');
    await crawler.run(['https://kkmzt.com/photo/']);
    console.log('爬取完成!');
})();