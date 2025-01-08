import { CheerioCrawler } from 'crawlee';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const targetUrl = 'https://kkmzt.com/beauty'; // 替换为目标 URL
const targetDate = '2025-01-03'; // 替换为目标日期
const downloadDir = path.resolve(`./kkmzt-beauty-images/${targetDate}`);

// 确保保存目录存在
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}
console.log(`图片将保存到: ${downloadDir}`);

// 图片下载函数
const downloadImage = async (url, savePath) => {
    try {
        const writer = fs.createWriteStream(savePath);
        const response = await axios({
            method: 'get',
            url,
            responseType: 'stream',
        });

        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log(`图片下载成功: ${savePath}`);
    } catch (error) {
        console.error(`图片下载失败: ${url}, 错误原因: ${error.message}`);
    }
};

const crawler = new CheerioCrawler({
    async requestHandler({ $, request, log }) {
        log.info(`正在处理页面: ${request.url}`);

        // 查找目标文章块
        const articles = $('.uk-article');
        const imagesToDownload = [];

        articles.each((_, article) => {
            const timeElement = $(article).find('time');
            const dateText = timeElement.text().trim();

            // 如果文章日期匹配目标日期
            if (dateText.startsWith(targetDate)) {
                const inlineImages = $(article).find('.uk-inline .u-thumb-f img');
                inlineImages.each((_, img) => {
                    const src = $(img).attr('src');
                    if (src) {
                        imagesToDownload.push(src);
                    }
                });

                // 检查是否有隐藏内容
                const thumbNavImages = $(article)
                    .find('.f-hidden ul.uk-thumbnav li > a > img');
                thumbNavImages.each((_, img) => {
                    const src = $(img).attr('src');
                    if (src) {
                        imagesToDownload.push(src);
                    }
                });
            }
        });

        log.info(`找到 ${imagesToDownload.length} 张图片，准备下载...`);

        // 下载图片
        for (const imageUrl of imagesToDownload) {
            const imageName = path.basename(imageUrl);
            const savePath = path.join(downloadDir, imageName);

            await downloadImage(imageUrl, savePath);

            // 随机延迟，避免被识别为爬虫
            const delay = Math.random() * 1000 + 1000;
            log.info(`等待 ${delay.toFixed(0)} 毫秒...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    },
});

(async () => {
    console.log('启动爬虫...');
    await crawler.run([targetUrl]);
    console.log('爬取完成!');
})();