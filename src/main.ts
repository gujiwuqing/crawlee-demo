import {HotArticles} from './scripts/juejin/hot-articles.js'
import test2 from './scripts/test2.js'

const tasks = {
    HotArticles,
    test2
};

async function runTask(taskName) {
    if (tasks[taskName]) {
        console.log(`Starting ${taskName}`);
        await tasks[taskName]();
        console.log(`${taskName} completed`);
    } else {
        console.error(`Task "${taskName}" not found`);
    }
}

async function runAllTasks() {
    for (const [taskName, task] of Object.entries(tasks)) {
        console.log(`Starting ${taskName}`);
        await task();
        console.log(`${taskName} completed`);
    }
    console.log('All tasks completed');
}

// 获取命令行参数
const tasksToRun = process.argv.slice(2);

if (tasksToRun.length > 0) {
    // 如果提供了任务名称，则运行指定的任务
    Promise.all(tasksToRun.map(taskName => runTask(taskName)))
        .then(() => console.log('Specified tasks completed'))
        .catch(console.error);
} else {
    // 如果没有提供任务名称，则运行所有任务
    runAllTasks().catch(console.error);
}
