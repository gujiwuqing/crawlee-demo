import { PlaywrightCrawler } from "crawlee";
import dayjs from "dayjs";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const CONFIG = {
    baseUrl: "https://juejin.cn/hot/articles",
    scrollTimes: 6,
    scrollDelay: 2000,
    outputDir: path.join(__dirname, "hot"),
};

// 工具函数：确保目录存在
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// 创建爬虫
const crawler = new PlaywrightCrawler({
    launchContext: {
        launchOptions: {
            headless: false,
        },
    },
    maxRequestsPerCrawl: 50,
    async requestHandler({ page, request, log }) {
        const category = request.userData.category || "综合";

        log.info(`开始处理分类: ${category}`);

        // 滚动页面
        log.info("滚动加载内容...");
        for (let i = 0; i < CONFIG.scrollTimes; i++) {
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight);
            });
            await page.waitForTimeout(CONFIG.scrollDelay);
        }

        // 等待文章元素加载
        await page.waitForSelector(".article-item-link", { timeout: 10000 });

        log.info("开始采集文章信息...");
        const articles = await page.$$eval(".article-item-link", (links) =>
            links.map((link) => ({
                title:
                    link.querySelector(".article-title")?.textContent.trim() || "未命名",
                link: link.href,
                author:
                    link.querySelector(".article-author-name-text")?.textContent.trim() ||
                    "未知作者",
                hotNumber:
                    link.querySelector(".hot-number")?.textContent.trim() || "未知热度",
            }))
        );

        try {
            ensureDir(CONFIG.outputDir);

            const dateDir = path.join(CONFIG.outputDir, dayjs().format("YYYY-MM-DD"));
            ensureDir(dateDir);

            const filePath = path.join(dateDir, `${category}.json`);
            fs.writeFileSync(filePath, JSON.stringify(articles, null, 2), "utf-8");

            log.info(`分类 ${category} 的数据已保存到 ${filePath}`);
        } catch (error) {
            console.error(`保存分类 ${category} 数据时出错:`, error);
        }
    },
});

// 主函数
async function HotArticles() {
    const categoryUrls = [];
    const categoryNames = [];

    // 提取分类链接
    const categoryExtractor = new PlaywrightCrawler({
        launchContext: {
            launchOptions: {
                headless: true,
            },
        },
        async requestHandler({ page, log }) {
            log.info("滚动加载内容...");
            for (let i = 0; i < CONFIG.scrollTimes; i++) {
                await page.evaluate(() => {
                    window.scrollBy(0, window.innerHeight);
                });
                await page.waitForTimeout(CONFIG.scrollDelay);
            }

            log.info("正在提取分类链接...");
            await page.waitForSelector(".sub-nav-item-content", { timeout: 10000 });

            const categories = await page.$$eval(".sub-nav-item-content", (links) =>
                links.map((link) => ({
                    name: link.querySelector(".nav-item-text")?.textContent.trim() || "未知分类",
                    url: link.querySelector("a")?.href,
                }))
            );

            // 检查提取结果
            console.log("提取到的分类:", categories);

            categories.forEach(({ url, name }) => {
                if (url && name) {
                    categoryUrls.push(url);
                    categoryNames.push(name);
                }
            });

            log.info(`提取到分类数量: ${categories.length}`);
        },
    });

    await categoryExtractor.run([CONFIG.baseUrl]);

    if (categoryUrls.length === 0) {
        console.error("未能提取到分类链接，请检查选择器！");
        return;
    }

    const requests = categoryUrls.map((url, index) => ({
        url,
        userData: { category: categoryNames[index] },
    }));

    await crawler.run(requests);

    console.log("所有分类数据采集完成");
}

HotArticles();