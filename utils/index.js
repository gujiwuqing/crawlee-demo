import path from 'path';
import fs from 'fs';
import dayjs from 'dayjs';
import axios from 'axios';

/**
 * 确保目录存在
 * @param {string} dirPath - 目录路径
 */
export async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

/**
 * 保存数据到指定文件
 * @param {Object} data - 要保存的数据
 * @param {string} currentFilePath - 当前文件的路径 (import.meta.url)
 * @param {string} subDir - 子目录名称 (如: 'frontend', 'hot-articles')
 */
export async function saveToFile(data, currentFilePath, subDir) {
    // 获取当前文件所在目录
    const currentDir = path.dirname(new URL(currentFilePath).pathname);
    const savePath = path.join(currentDir, subDir, dayjs().format('YYYY-MM-DD'));

    // 确保目录存在
    await ensureDir(savePath);

    // 保存文件
    const filePath = path.join(savePath, `${subDir}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`数据已保存到: ${filePath}`);
}

/**
 * 随机延迟函数
 * @param {number} min - 最小延迟时间（毫秒）
 * @param {number} max - 最大延迟时间（毫秒）
 * @returns {Promise<void>}
 */
export const randomDelay = (min, max) => {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, delay));
};


// 图片下载函数
export const downloadImage = async (url, filepath) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    console.log(`成功下载图片: ${filepath}`);
};






// 图片下载函数
export const requestDownloadImage = async (url, savePath) => {
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
