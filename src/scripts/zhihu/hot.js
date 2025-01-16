import { chromium } from 'playwright';
import path from 'path';
import { saveToFile } from '../../../utils/index.js';
import dayjs from 'dayjs';

// 用户数据存储目录
const userDataDir = path.resolve('./user-data');

// 主函数
async function main() {
    const browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
    });

    try {
        const page = await browser.newPage();
        await page.goto('https://www.zhihu.com/hot', { waitUntil: 'networkidle' });

        console.log('已进入知乎热榜页面，开始滚动以加载数据...');

        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight);
            });
            await page.waitForTimeout(1000);
        }

        await page.waitForSelector('.HotList-list', { timeout: 15000 });
        console.log('开始提取热榜数据...');

        // 提取热榜数据，不在浏览器环境中处理时间
        const hotList = await page.evaluate(() => {
            const items = document.querySelectorAll('.HotItem');
            return Array.from(items).map((item, index) => {
                const titleElement = item.querySelector('.HotItem-content');
                const title = titleElement.querySelector('.HotItem-title')?.textContent?.trim() || '未知标题';
                const link = item.querySelector('a')?.href || '';

                const metricsElement = item.querySelector('.HotItem-metrics');
                const heatText = metricsElement?.textContent?.trim() || '';
                const heat = heatText.match(/(\d+(?:\.\d+)?[万亿]?)\s*热度/)?.[1] || '0';

                const topicElement = item.querySelector('.HotItem-label');
                const topic = topicElement?.textContent?.trim() || '';

                const excerptElement = item.querySelector('.HotItem-excerpt');
                const excerpt = excerptElement?.textContent?.trim() || '';

                const imageElement = item.querySelector('.HotItem-img');
                const imageUrl = imageElement?.src || '';

                return {
                    rank: index + 1,
                    title,
                    link,
                    heat,
                    topic,
                    excerpt,
                    imageUrl,
                    platform: '知乎'
                };
            });
        });

        // 在 Node.js 环境中添加时间信息
        const currentTime = dayjs().format('YYYY-MM-DD HH:mm:ss');
        const processedHotList = hotList.map(item => ({
            ...item,
            crawlTime: currentTime
        }));

        console.log(`成功获取 ${processedHotList.length} 条热榜数据`);

        // 构建结果对象
        const results = {
            timestamp: currentTime,
            total: processedHotList.length,
            topics: processedHotList
        };

        // 保存数据
        await saveToFile(results, import.meta.url, 'zhihu-hot');
        console.log('知乎热榜数据保存完成！');

        return results;
    } catch (error) {
        console.error('爬取过程中发生错误:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

try {
    await main();
    console.log('知乎热榜数据采集完成');
} catch (error) {
    console.error('知乎热榜采集失败:', error);
    throw error;
}