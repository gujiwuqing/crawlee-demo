import { PlaywrightCrawler } from 'crawlee';
import { randomDelay, saveToFile, downloadFont } from '../../../utils/index.js';
import dayjs from 'dayjs';
import path from 'path';
import fs from 'fs';

const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 60,
    headless: process.env.CI === 'true',

    async requestHandler({ page, log }) {
        try {
            log.info('正在爬取起点月票榜数据...');

            // 等待页面加载
            await page.waitForLoadState('networkidle');
            await page.waitForSelector('.rank-body', { timeout: 10000 });

            // 获取字体URL和名称
            const fontInfo = await page.evaluate(() => {
                const styleSheet = Array.from(document.styleSheets)
                    .find(sheet => sheet.href === null && sheet.cssRules[0]?.cssText.includes('@font-face'));

                if (!styleSheet) return null;

                const fontFaceRule = Array.from(styleSheet.cssRules)
                    .find(rule => rule.type === CSSRule.FONT_FACE_RULE);

                if (!fontFaceRule) return null;

                const fontUrl = fontFaceRule.style.getPropertyValue('src').match(/url\('(.+?)'\)/)?.[1];
                // 确保 URL 是完整的
                const fullUrl = fontUrl?.startsWith('//') 
                    ? `https:${fontUrl}` 
                    : fontUrl?.startsWith('/') 
                        ? `https://www.qidian.com${fontUrl}`
                        : fontUrl;

                return {
                    url: fullUrl,
                    family: fontFaceRule.style.getPropertyValue('font-family').replace(/['"]/g, '')
                };
            });

            if (fontInfo && fontInfo.url) {
                log.info('检测到自定义字体:', fontInfo);
                try {
                    // 下载字体文件
                    const fontPath = await downloadFont(fontInfo.url, `${fontInfo.family}.woff`);
                    log.info('字体文件已保存:', fontPath);
                } catch (error) {
                    log.error('下载字体文件失败:', error);
                    // 继续执行，不要因为字体下载失败而中断整个爬虫
                }
            }

            const allBooks = [];
            // 需要爬取前50本书，每页20本，需要爬取3页
            for (let pageNum = 1; pageNum <= 3; pageNum++) {
                if (pageNum > 1) {
                    // 点击下一页
                    log.info(`正在翻到第 ${pageNum} 页...`);
                    await page.click(`.pagination a[data-page="${pageNum}"]`);
                    await page.waitForLoadState('networkidle');
                    await randomDelay(1000, 2000);
                }

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

                // 采集当前页数据
                log.info(`正在采集第 ${pageNum} 页数据...`);
                const booksOnPage = await page.evaluate(() => {
                    const books = document.querySelectorAll('#book-img-text li');
                    return Array.from(books).map(book => {
                        // 获取基本信息
                        const nameElement = book.querySelector('.book-mid-info h2 a');
                        const authorElement = book.querySelector('.book-mid-info .author .name');
                        const categoryElements = book.querySelectorAll('.book-mid-info .author a:not(.name)');
                        const descElement = book.querySelector('.book-mid-info .intro');
                        const statusElement = book.querySelector('.book-mid-info .author span');
                        const latestChapterElement = book.querySelector('.book-mid-info .update a');
                        const updateTimeElement = book.querySelector('.book-mid-info .update span');
                        const rankElement = book.querySelector('.book-img-box .rank-tag');
                        const coverElement = book.querySelector('.book-img-box img');
                        const monthlyTicketElement = book.querySelector('.book-right-info .total');

                        // 获取分类信息
                        const categories = Array.from(categoryElements).map(el => el.textContent.trim());
                        const mainCategory = categories[0] || '';
                        const subCategory = categories[1] || '';

                        // 获取月票数据
                        const monthlyTicketText = monthlyTicketElement?.textContent?.trim() || '0';
                        const fontFamily = window.getComputedStyle(monthlyTicketElement).fontFamily;

                        return {
                            name: nameElement?.textContent?.trim() || '',
                            link: nameElement?.href?.replace(/^\/\//, 'https://') || '',
                            author: {
                                name: authorElement?.textContent?.trim() || '',
                                link: authorElement?.href?.replace(/^\/\//, 'https://') || ''
                            },
                            cover: {
                                url: coverElement?.src?.replace(/^\/\//, 'https://') || '',
                                alt: coverElement?.alt || ''
                            },
                            category: {
                                main: mainCategory,
                                sub: subCategory
                            },
                            description: descElement?.textContent?.trim() || '',
                            status: statusElement?.textContent?.trim() || '',
                            latestChapter: {
                                title: latestChapterElement?.textContent?.replace('最新更新', '').trim() || '',
                                link: latestChapterElement?.href?.replace(/^\/\//, 'https://') || ''
                            },
                            updateTime: updateTimeElement?.textContent?.trim() || '',
                            rank: rankElement?.textContent?.replace(/[^0-9]/g, '') || '',
                            monthlyTicket: monthlyTicketText,
                            monthlyTicketFont: fontFamily
                        };
                    });
                });

                // 处理采集到的数据
                const processedBooks = booksOnPage.map(book => ({
                    ...book,
                    monthlyTicket: decodeCustomFont(book.monthlyTicketRaw)
                }));

                allBooks.push(...processedBooks);
                log.info(`第 ${pageNum} 页数据采集完成，当前共有 ${allBooks.length} 本书的数据`);

                await randomDelay(1500, 2500);
            }

            // 只取前50本书的数据
            const top50Books = allBooks.slice(0, 50);

            // 构建结果对象
            const results = {
                timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                total: top50Books.length,
                books: top50Books.map(book => ({
                    ...book,
                    platform: '起点中文网',
                    rankType: '月票榜',
                    crawlTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
                }))
            };

            log.info(`成功采集 ${results.total} 本书的数据`);

            // 保存数据
            await saveToFile(results, import.meta.url, 'yuepiao');
            log.info('月票榜数据保存完成！');

            return results;

        } catch (error) {
            log.error('爬取过程中发生错误:', error);
            throw error;
        }
    },
});

// 修改导出部分
export const qidian = {
    async run() {
        try {
            await crawler.run(['https://www.qidian.com/rank/yuepiao/']);
        } catch (error) {
            console.error('爬取过程中发生错误:', error);
            throw error;
        }
    }
};
