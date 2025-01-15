import path from 'path';
import fs from 'fs';
import dayjs from 'dayjs';
import axios from 'axios';
import { fileURLToPath } from 'url';

/**
 * 确保目录存在
 * @param {string} dirPath - 目录路径
 */
export function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * 保存数据到指定文件
 * @param {Object} data - 要保存的数据
 * @param {string} currentFilePath - 当前文件的路径 (import.meta.url)
 * @param {string} subDir - 子目录名称 (如: 'frontend', 'hot-articles')
 */
export function saveToFile(data, currentFilePath, subDir) {
    // 获取当前文件所在目录
    const currentDir = path.dirname(new URL(currentFilePath).pathname);
    const savePath = path.join(currentDir, subDir, dayjs().format('YYYY-MM-DD'));

    // 确保目录存在
    ensureDir(savePath);

    // 保存文件
    const filePath = path.join(savePath, `${subDir}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
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

/**
 * 图片下载函数 (使用 fetch)
 * @param {string} url - 图片URL
 * @param {string} filepath - 保存路径
 */
export const downloadImage = async (url, filepath) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    console.log(`成功下载图片: ${filepath}`);
};

/**
 * 图片下载函数 (使用 axios)
 * @param {string} url - 图片URL
 * @param {string} savePath - 保存路径
 */
export const requestDownloadImage = async (url, savePath) => {
    try {
        const writer = fs.createWriteStream(savePath);
        const response = await axios({
            method: 'get',
            url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://www.mtku.net/'
            }
        });

        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (error) {
        console.error(`图片下载失败: ${url}, 错误原因: ${error.message}`);
        throw error; // 重新抛出错误，让调用者处理
    }
};

// 获取当前文件所在目录
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 下载字体文件
async function downloadFont(url, filename) {
    const fontDir = path.join(__dirname, '../fonts');
    if (!fs.existsSync(fontDir)) {
        fs.mkdirSync(fontDir, { recursive: true });
    }

    const fontPath = path.join(fontDir, filename);

    // 如果字体文件已存在，直接返回路径
    if (fs.existsSync(fontPath)) {
        return fontPath;
    }

    try {
        const response = await axios({
            method: 'get',
            url,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        fs.writeFileSync(fontPath, response.data);
        console.log(`字体文件已保存到: ${fontPath}`);
        return fontPath;
    } catch (error) {
        console.error('下载字体文件失败:', error);
        throw error;
    }
}

export { downloadFont };
