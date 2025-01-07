import fs from 'fs';
import axios from 'axios';
// 延迟函数
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// 图片下载函数
export const downloadImage = async (url, filepath) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    console.log(`成功下载图片: ${filepath}`);
};


// 图片下载函数
export const requestDownloadImage = async (url, filepath) => {
    const response = await axios({
        method: 'get',
        url,
        responseType: 'stream',
    });

    const writer = fs.createWriteStream(filepath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
};
