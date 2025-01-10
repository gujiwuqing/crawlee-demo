import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
    // 网易邮箱
    service: '163',
    // 权限认证
    auth: {
        user: '15279279713@163.com',
        // !! 这里读的github里面的环境变量，是我本人的信息，本地跑的话一定需要改这里
        pass: 'SWv5h8svf9zknWMa'
    }
})

const sendMail = function (options) {
    let mailOptions = {
        from: `"cobill"<15279279713@163.com>`, // 发邮件的账号
        to: '15279279713@163.com', // 收邮件的账号
        subject: '下班打卡提醒', // 邮件的标题
        html: '别忘了打卡'      // 邮寄的内容
    }
    transporter.sendMail(mailOptions, (err, info) => {
        if (!err) {
            console.log('🎉🎉🎉邮件已经发送完成')
        } else {
            console.log('邮件发送失败', err)
        }
    })
}

sendMail()