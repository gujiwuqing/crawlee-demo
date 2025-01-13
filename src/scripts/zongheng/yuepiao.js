import { PlaywrightCrawler } from 'crawlee';
import { randomDelay, saveToFile } from '../../../utils/index.js';
import dayjs from 'dayjs';
import fs from 'fs';

const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 120,
    headless: false,

    async requestHandler({ page, log }) {
        try {
            log.info('正在爬取纵横月票榜数据...');

            // 访问首页
            await page.goto('https://www.zongheng.com/', {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            await randomDelay(2000, 3000);

            // 点击排行榜
            log.info('点击排行榜...');
            const rankLink = await page.waitForSelector('a.home-tap-link__left-item[title="排行榜"]', {
                timeout: 10000,
                state: 'visible'
            });
            await rankLink.click();
            await randomDelay(2000, 3000);

            // 等待新标签页打开
            const pages = await page.context().pages();
            const rankPage = pages[pages.length - 1];
            await rankPage.waitForLoadState('networkidle');

            // 点击月票榜的"更多"
            log.info('点击月票榜更多...');
            const moreButton = await rankPage.waitForSelector('.rank-content-default__main > div:first-child .rank-content-default__more span.global-arrow', {
                timeout: 10000,
                state: 'visible'
            });
            await moreButton.click();
            await randomDelay(2000, 3000);

            const allBooks = [];
            // 需要爬取前50本书，每页20本，需要爬取3页
            for (let pageNum = 1; pageNum <= 3; pageNum++) {
                if (pageNum > 1) {
                    log.info(`正在翻到第 ${pageNum} 页...`);

                    // 先滚动到页面底部以确保分页元素可见
                    await rankPage.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    await randomDelay(1000, 2000);

                    // 等待分页元素加载
                    try {
                        await rankPage.waitForSelector('.el-pagination', {
                            timeout: 10000,
                            state: 'visible'
                        });

                        // 再次确认分页元素在视图中
                        await rankPage.evaluate(() => {
                            const pagination = document.querySelector('.el-pagination');
                            if (pagination) {
                                pagination.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        });
                        await randomDelay(1000, 2000);

                        // 尝试点击页码
                        const pageButtons = await rankPage.$$('.el-pagination .el-pager li.number');
                        let targetButton = null;

                        for (const button of pageButtons) {
                            const text = await button.textContent();
                            if (text.trim() === String(pageNum)) {
                                targetButton = button;
                                break;
                            }
                        }

                        if (targetButton) {
                            // 确保按钮可点击
                            await rankPage.evaluate(button => {
                                button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, targetButton);
                            await randomDelay(500, 1000);

                            await targetButton.click();
                            await rankPage.waitForLoadState('networkidle');
                            log.info(`已点击第 ${pageNum} 页按钮`);
                        } else {
                            throw new Error(`未找到第 ${pageNum} 页的按钮`);
                        }

                        // 等待新内容加载
                        await rankPage.waitForSelector('.rank-modules-works--main-item', {
                            timeout: 10000,
                            state: 'visible'
                        });

                        await randomDelay(2000, 3000);

                    } catch (error) {
                        log.error(`跳转到第 ${pageNum} 页时出错:`, error);
                        // 保存错误截图
                        const screenshot = await rankPage.screenshot({ fullPage: true });
                        const screenshotPath = `error-page${pageNum}-${Date.now()}.png`;
                        fs.writeFileSync(screenshotPath, screenshot);
                        log.error(`页面截图已保存至: ${screenshotPath}`);
                        throw error;
                    }
                }

                // 等待列表加载
                await rankPage.waitForSelector('.rank-modules-works', { timeout: 10000 });

                // 滚动页面
                log.info('开始缓慢滚动页面...');
                const scrollStep = 100;
                for (let i = 0; i < 15; i++) {
                    await rankPage.evaluate((step) => {
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
                const booksOnPage = await rankPage.evaluate(() => {
                    const books = document.querySelectorAll('.rank-modules-works--main-item');
                    return Array.from(books).map(book => {
                        // 获取基本信息
                        const rankElement = book.querySelector('.rank-modules-works--main-item-num');
                        const nameElement = book.querySelector('.rank-modules-works--main-item-title');
                        const authorElement = book.querySelector('.rank-modules-works--main-item-author a:first-child');
                        const categoryElement = book.querySelector('.rank-modules-works--main-item-author a:nth-child(3)');
                        const statusElement = book.querySelector('.rank-modules-works--main-item-author span:last-child');
                        const updateElement = book.querySelector('.rank-modules-works--main-item-chapter-name a');
                        const updateTimeElement = book.querySelector('.rank-modules-works--main-item-chapter span');
                        const coverElement = book.querySelector('.rank-modules-works--main-item-img img');
                        const descElement = book.querySelector('.rank-modules-works--main-item-desc');
                        const monthlyTicketElement = book.querySelector('.rank-content--btn-text');

                        return {
                            rank: rankElement?.textContent?.trim().replace(/[^0-9]/g, '') || '',
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
                            category: categoryElement?.textContent?.trim() || '',
                            status: statusElement?.textContent?.trim() || '',
                            description: descElement?.textContent?.trim() || '',
                            latestChapter: {
                                title: updateElement?.textContent?.trim() || '',
                                link: updateElement?.href?.replace(/^\/\//, 'https://') || ''
                            },
                            updateTime: updateTimeElement?.textContent?.trim() || '',
                            monthlyTicket: monthlyTicketElement?.textContent?.trim().replace(/[^0-9]/g, '') || '0'
                        };
                    });
                });

                // 输出调试信息
                log.info(`当前页面URL: ${rankPage.url()}`);
                log.info(`找到 ${booksOnPage.length} 本书`);

                allBooks.push(...booksOnPage);
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
                    platform: '纵横中文网',
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
            if (page) {
                const screenshot = await page.screenshot({ fullPage: true });
                const screenshotPath = `error-screenshot-${Date.now()}.png`;
                fs.writeFileSync(screenshotPath, screenshot);
                log.error(`页面截图已保存至: ${screenshotPath}`);
            }
            throw error;
        }
    },
});

export const zongheng = {
    async run() {
        try {
            await crawler.run(['http://www.zongheng.com/rank/details/yuepiao.html']);
        } catch (error) {
            console.error('爬取过程中发生错误:', error);
            throw error;
        }
    }
};

// 可选：如果需要，也可以添加选择每页显示数量的功能
async function selectPageSize(page, size) {
    // 点击选择器
    await page.click('.el-pagination__sizes .el-input__inner');
    await randomDelay(500, 1000);

    // 选择对应的选项
    await page.click(`.el-select-dropdown__item:has-text("${size}条/页")`);
    await page.waitForLoadState('networkidle');
    await randomDelay(1000, 2000);
}

// 如果遇到错误，可以添加重试机制
async function tryClickPage(page, pageNum, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const pageButton = await page.waitForSelector(
                `.el-pagination .el-pager li.number:text("${pageNum}")`,
                { timeout: 5000, state: 'visible' }
            );
            await pageButton.click();
            await page.waitForLoadState('networkidle');

            // 验证是否成功跳转
            const currentPage = await page.$eval('.el-pagination .el-pager li.active', el => el.textContent);
            if (currentPage === String(pageNum)) {
                return true;
            }
        } catch (error) {
            console.log(`第 ${i + 1} 次尝试跳转到第 ${pageNum} 页失败`);
            await randomDelay(1000, 2000);
        }
    }
    throw new Error(`无法跳转到第 ${pageNum} 页`);
}
