import puppeteer from 'puppeteer'
import fs from 'fs'
import { createObjectCsvWriter } from 'csv-writer'
import moment from 'moment'
import chalk from 'chalk'

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

// 通用等待函数
const wait = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// 监控价格 - 优化版本（单页面持续监控）
async function monitorPriceOptimized(interval = 60, duration = null) {
  const startTime = Date.now();
  let running = true;
  
  log.highlight('启动优化版黄金价格监控...');
  log.info(`监控间隔: ${chalk.yellow(interval)}秒`);
  
  // 启动浏览器（只启动一次）
  log.info('启动浏览器...');
  const browser = await puppeteer.launch({
    headless: true,  // 无界面模式
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    // 创建页面（只创建一次）
    const page = await browser.newPage();
    
    // 设置视口大小
    await page.setViewport({ width: 1366, height: 768 });
    
    // 设置用户代理
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // 访问目标网页
    log.info('正在访问目标网页...');
    await page.goto('https://quote.cngold.org/gjs/gjhj_xhhj.html', {
      waitUntil: 'networkidle2',
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
    await wait(3000);
    
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
        await wait(3000);
      } catch (e) {
        log.error(`点击切换单位按钮失败: ${e.message}`);
      }
    } else {
      log.success('已经是人民币单位，无需切换');
    }
    
    // 处理程序终止信号
    process.on('SIGINT', async () => {
      log.warning('\n程序被用户中断');
      running = false;
      
      // 确保浏览器正确关闭
      if (browser) {
        log.info('正在关闭浏览器...');
        await browser.close();
      }
      
      process.exit(0);
    });
    
    // 创建CSV写入器
    const csvWriter = setupCsvWriter('gold_prices.csv');
    
    // 主监控循环
    while (running) {
      // 检查是否达到监控时长
      if (duration && (Date.now() - startTime > duration * 1000)) {
        log.highlight(`已达到设定的监控时长 ${chalk.yellow(duration)} 秒，程序结束`);
        break;
      }
      
      const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
      log.highlight(`\n[${chalk.white.bgBlue(currentTime)}] 获取当前黄金价格...`);
      
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
          await wait(1000);
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
      if (screenshotCounter < interval) {
        await page.screenshot({ path: 'latest_gold_price.png' });
        log.success('已更新页面截图');
      }
      
      // 处理并显示数据
      if (goldData && Object.keys(goldData).length > 0) {
        log.highlight('获取到以下黄金价格数据:');
        log.divider();
        
        const dataList = [];
        
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
          console.log(`${chalk.yellow('价格')}: ${chalk.white.bold(price)} ${chalk.gray(unit)}`);
          
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
        
        // 保存数据
        if (dataList.length > 0) {
          await csvWriter.writeRecords(dataList);
          log.success(`数据已保存到 ${chalk.underline('gold_prices.csv')}`);
        }
      } else {
        log.warning('未获取到数据，可能需要刷新页面');
        
        // 如果连续多次获取失败，可以考虑重新加载页面
        try {
          log.info('尝试重新加载页面...');
          await page.reload({ waitUntil: 'networkidle2', timeout: 10000 });
          await wait(1000);
        } catch (e) {
          log.error(`页面重新加载失败: ${e.message}`);
        }
      }
      
      log.time(`等待 ${chalk.yellow(interval)} 秒后再次检查...`);
      // 等待下一次检查
      await wait(interval * 1000);
    }
  } catch (error) {
    log.error(`监控过程中出错: ${error.message}`);
  } finally {
    // 确保浏览器正确关闭
    if (browser) {
      log.info('正在关闭浏览器...');
      await browser.close();
    }
  }
}

// 程序入口
(async () => {
  try {
    console.log(chalk.bgYellow.black('\n 黄金价格监控工具 v1.0 \n'));
    // 每30秒检查一次，无限期运行
    // 如果要限制运行时间，可以设置第二个参数，如：monitorPriceOptimized(30, 86400) 运行24小时
    await monitorPriceOptimized(10);
  } catch (error) {
    log.error(`程序异常: ${error.message}`);
  }
})();
