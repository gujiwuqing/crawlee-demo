import {qidian} from './scripts/qidian/yuepiao.js';
import {zongheng} from './scripts/zongheng/yuepiao.js';
import {weibo} from './scripts/weibo/hot.js';
import { randomDelay } from '../utils/index.js';

// 定义要执行的任务列表
const tasks = [
    {
        name: '起点月票榜',
        run: async () => {
            try {
                await qidian.run();
                console.log('起点月票榜数据采集完成');
            } catch (error) {
                console.error('起点月票榜采集失败:', error);
            }
        }
    },
    {
        name: '纵横月票榜',
        run: async () => {
            try {
                await zongheng.run();
                console.log('纵横月票榜数据采集完成');
            } catch (error) {
                console.error('纵横月票榜采集失败:', error);
            }
        }
    },
    {
        name: '微博热搜',
        run: async () => {
            try {
                await weibo.run();
                console.log('微博热搜数据采集完成');
            } catch (error) {
                console.error('微博热搜采集失败:', error);
            }
        }
    },
];

// 顺序执行任务的函数
async function runTasksSequentially() {
    console.log('开始执行采集任务...');
    
    for (const task of tasks) {
        console.log(`\n开始执行: ${task.name}`);
        const startTime = new Date();
        
        try {
            await task.run();
            
            const endTime = new Date();
            const duration = (endTime - startTime) / 1000;
            console.log(`${task.name} 执行完成，耗时: ${duration}秒`);
            
            // 任务之间添加随机延迟
            if (tasks.indexOf(task) < tasks.length - 1) {
                console.log('等待执行下一个任务...');
                await randomDelay(3000, 5000);
            }
        } catch (error) {
            console.error(`${task.name} 执行失败:`, error);
        }
    }
    
    console.log('\n所有任务执行完成！');
}

// 执行任务
try {
    await runTasksSequentially();
} catch (error) {
    console.error('任务执行过程中发生错误:', error);
}
