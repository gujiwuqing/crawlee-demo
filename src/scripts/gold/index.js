import { PlaywrightCrawler } from 'crawlee';
import { randomDelay, saveToFile } from '../../../utils/index.js';
import chalk from 'chalk';
import moment from 'moment';
import fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

// 设置moment语言为中文
moment.locale('zh-cn');

// 定义日志样式
const log = {
  info: (msg) => console.log(chalk.blue('ℹ️ INFO: ') + msg),
  success: (msg) => console.log(chalk.green('✅ SUCCESS: ') + msg),
  warning: (msg) => console.log(chalk.yellow('⚠️ WARNING: ') + msg),
  error: (msg) => console.error(chalk.red('❌ ERROR: ') + msg),
  highlight: (msg) => console.log(chalk.magenta('🔍 ') + msg),
  data: (msg) => console.log(chalk.cyan('📊 DATA: ') + msg),
  time: (msg) => console.log(chalk.gray('⏱️ ') + msg),
  divider: () => console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
};

// 配置CSV写入器
const setupCsvWriter = (filePath) => {
  return createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'timestamp', title: '时间' },
      { id: 'name', title: '品种名称' },
      { id: 'code', title: '代码' },
      { id: 'price', title: '价格(人民币)' },
      { id: 'change', title: '涨跌' },
      { id: 'changePercent', title: '涨跌幅' },
      { id: 'status', title: '交易状态' },
      { id: 'updateTime', title: '行情更新时间' },
      { id: 'unit', title: '单位' }
    ],
    append: fs.existsSync(filePath)
  });
};

// 创建 PlaywrightCrawler 实例
const crawler = new PlaywrightCrawler({
  maxConcurrency: 1,
  requestHandlerTimeoutSecs: 60,
  headless: true,

  async requestHandler({ page, log: crawlerLog }) {
    crawlerLog.info('正在监控黄金价格...');

    // 设置视窗大小
    await page.setViewportSize({ width: 1366, height: 768 });

    // 设置用户代理
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    // 修改 navigator.webdriver
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // 访问目标网页
    log.info('正在访问目标网页...');
    await page.goto('https://quote.cngold.org/gjs/gjhj_xhhj.html', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // 等待页面加载完成
    try {
      await page.waitForSelector('#now_price', { timeout: 10000 });
      log.success('价格元素已加载');
    } catch (e) {
      log.warning('等待价格元素超时，将尝试继续执行');
    }

    // 等待额外的时间让JavaScript执行
    log.time('等待3秒让页面完全加载...');
    await randomDelay(1000, 3000);

    // 检查并切换到人民币单位（只需要在开始时执行一次）
    log.info('检查价格单位...');
    const unitText = await page.evaluate(() => {
      const unitElement = document.querySelector('#quoteUnit');
      return unitElement ? unitElement.textContent.trim() : '';
    });

    log.data(`当前价格单位: ${chalk.yellow(unitText)}`);

    // 如果不是人民币单位，点击切换
    if (!unitText.includes('元/克')) {
      log.info('点击切换到人民币价格...');
      try {
        await page.click('#quoteUnit');
        log.success('已点击切换单位按钮');

        // 等待价格更新
        log.time('等待3秒让价格更新...');
        await randomDelay(1000, 3000);
      } catch (e) {
        log.error(`点击切换单位按钮失败: ${e.message}`);
      }
    } else {
      log.success('已经是人民币单位，无需切换');
    }

    // 点击刷新按钮（如果有的话）
    try {
      const refreshExists = await page.evaluate(() => {
        const refreshBtn = document.querySelector('a[onclick="refreshNameAndCode()"]');
        return !!refreshBtn;
      });

      if (refreshExists) {
        log.info('点击刷新按钮...');
        await page.evaluate(() => {
          const refreshBtn = document.querySelector('a[onclick="refreshNameAndCode()"]');
          if (refreshBtn) refreshBtn.click();
        });

        // 等待数据刷新
        await randomDelay(500, 1000);
      }
    } catch (e) {
      log.warning('刷新按钮不可用，继续获取当前数据');
    }

    // 提取当前数据
    const goldData = await page.evaluate(() => {
      // 获取价格元素
      const priceElement = document.querySelector('#now_price');
      const changeElement = document.querySelector('#upOrDown_div');
      const nameElement = document.querySelector('#realtime_showname');
      const statusElement = document.querySelector('#status_em');
      const timeElement = document.querySelector('#quote_time');
      const unitElement = document.querySelector('#quoteUnit');

      // 构建结果对象
      return {
        '现货黄金': {
          price: priceElement ? priceElement.textContent.trim() : '----',
          change: changeElement ? changeElement.textContent.trim() : '--',
          changePercent: 'N/A',
          code: nameElement && nameElement.querySelector('span') ?
                nameElement.querySelector('span').textContent.trim() : '--',
          status: statusElement ? statusElement.textContent.trim() : 'N/A',
          updateTime: timeElement ? timeElement.textContent.trim() : '- - --:--:--',
          unit: unitElement ? unitElement.textContent.trim() : 'N/A'
        }
      };
    });

    // 每10次获取保存一次截图（用于调试）
    const screenshotCounter = Math.floor(Date.now() / 1000) % 600; // 每10分钟一次
    if (screenshotCounter < 10) {
      await page.screenshot({ path: 'latest_gold_price.png' });
      log.success('已更新页面截图');
    }

    // 处理并显示数据
    if (goldData && Object.keys(goldData).length > 0) {
      log.highlight('获取到以下黄金价格数据:');
      log.divider();

      const dataList = [];
      const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');

      for (const [name, info] of Object.entries(goldData)) {
        const price = info.price || 'N/A';
        const change = info.change || 'N/A';

        const num = parseFloat(change.split('(')[0]);
        const changePercent = num > 0 ? '涨' : '跌';
        const code = info.code || 'N/A';
        const status = info.status || 'N/A';
        const updateTime = info.updateTime || 'N/A';
        const unit = info.unit || 'N/A';

        console.log(`${chalk.yellow('品种')}: ${chalk.white.bold(name)} (${chalk.gray(code)})`);
        console.log(`${chalk.yellow('价格')}: ${chalk.red.bold(price)} ${chalk.gray(unit)}`);

        // 根据涨跌显示不同颜色
        const changeColor = num > 0 ? chalk.red : chalk.green;
        console.log(`${chalk.yellow('涨跌')}: ${changeColor(change)}`);
        console.log(`${chalk.yellow('涨跌幅')}: ${changeColor(changePercent)}`);

        // 根据交易状态显示不同颜色
        const statusColor = status.includes('交易中') ? chalk.green : chalk.gray;
        console.log(`${chalk.yellow('交易状态')}: ${statusColor(status)}`);
        console.log(`${chalk.yellow('行情更新时间')}: ${chalk.gray(updateTime)}`);
        log.divider();

        // 尝试解析涨跌幅
        let parsedChange = change;
        let parsedChangePercent = changePercent;

        const match = change.match(/([-+]?\d+\.?\d*)\(([-+]?\d+\.?\d*%)\)/);
        if (match) {
          parsedChange = match[1];
          parsedChangePercent = match[2];
        }

        dataList.push({
          timestamp: currentTime,
          name,
          code,
          price,
          change: parsedChange,
          changePercent: parsedChangePercent,
          status,
          updateTime,
          unit
        });
      }

      // 保存数据到CSV
      if (dataList.length > 0) {
        const csvWriter = setupCsvWriter('gold_prices.csv');
        await csvWriter.writeRecords(dataList);
        log.success(`数据已保存到 ${chalk.underline('gold_prices.csv')}`);
      }
    } else {
      log.warning('未获取到数据，可能需要刷新页面');

      // 如果连续多次获取失败，可以考虑重新加载页面
      try {
        log.info('尝试重新加载页面...');
        await page.reload({ waitUntil: 'networkidle2', timeout: 10000 });
        await randomDelay(500, 1000);
      } catch (e) {
        log.error(`页面重新加载失败: ${e.message}`);
      }
    }
  },
});

// 运行爬虫
try {
  console.log(chalk.bgYellow.black('\n 黄金价格监控工具 v2.0 \n'));
  
  // 设置定时任务，每10秒运行一次
  const interval = 10;
  const runInterval = async () => {
    try {
      await crawler.run(['https://quote.cngold.org/gjs/gjhj_xhhj.html']);
      log.time(`等待 ${chalk.yellow(interval)} 秒后再次检查...`);
      setTimeout(runInterval, interval * 1000);
    } catch (error) {
      log.error(`监控过程中出错: ${error.message}`);
      // 发生错误时也继续运行
      setTimeout(runInterval, interval * 1000);
    }
  };

  // 启动定时任务
  await runInterval();
} catch (error) {
  log.error(`程序异常: ${error.message}`);
}
