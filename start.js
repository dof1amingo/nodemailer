const nodemailer = require('nodemailer');
const smtpConfig = require('./smtp.json');
const config = require('./config.json');
const socks = require('socks');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const body = fs.readFileSync('letter.html', 'utf8');
const proxies = fs.readFileSync('proxy.txt', 'utf8').split('\n').filter(p => p.trim());
const recipients = fs.readFileSync('list.txt', 'utf8').split('\n').filter(r => r.trim());

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
        user: smtpConfig.username,
        pass: smtpConfig.password
    },
});

rl.question('Do you want to use a proxy? (Y/N): ', async answer => {
    const useProxy = answer.trim().toLowerCase().startsWith('y');

    if (useProxy) {
        const proxy = proxies[Math.floor(Math.random() * proxies.length)];
        const [proxyHost, proxyPort, proxyUser, proxyPass] = proxy.split(':');
        const proxyUrl = new URL(`socks://${proxyHost}:${proxyPort}`);
        proxyUrl.username = proxyUser;
        proxyUrl.password = proxyPass;
        transporter.set('proxy_socks_module', require('socks'));
        transporter.set('proxy', proxyUrl.href);
    }

    rl.question('Do you want to include attachments from the attachment folder? (Y/N): ', async answer => {
        const includeAttachment = answer.trim().toLowerCase().startsWith('y');

        rl.question('Please select the priority of the email (0-4): ', async answer => {
            const priority = parseInt(answer);

            const subject = config.emailSubject || 'Test email';

            if (includeAttachment) {
                const attachmentFolder = './attachments';
                fs.readdir(attachmentFolder, async (error, files) => {
                    if (error) {
                        console.log('Error reading attachment folder:', error.message);
                        rl.close();
                        return;
                    }

                    for (let i = 0; i < recipients.length; i++) {
                        const attachments = [];
                        for (const file of files) {
                            const attachmentPath = path.join(attachmentFolder, file);
                            const attachmentContent = fs.readFileSync(attachmentPath);
                            const attachment = {
                                filename: file,
                                content: attachmentContent,
                            };

                            // Replace the [[-email-]] placeholder with the recipient email address in the attachment content
                            const updatedAttachmentContent = attachment.content.toString().replace(/\[\[-email-\]\]/g, recipients[i]);
                            attachment.content = Buffer.from(updatedAttachmentContent, 'utf-8');

                            attachments.push(attachment);
                        }

                        const messageWithAttachments = {
                            from: {
                                name: smtpConfig.from.name,
                                address: smtpConfig.from.email,
                            },
                            to: [recipients[i]],
                            subject: subject.replace(/\[\[-email-\]\]/g, recipients[i]),
                            html: body.replace(/\[\[-email-\]\]/g, recipients[i]),
                            attachments: attachments,
                            priority: priority || 0,
                        };

                        transporter.sendMail(messageWithAttachments, (error, info) => {
                            if (error) {
                                console.log('Error:', error.message);
                            } else {
                                console.log('Message sent to:', info.envelope.to);

                                // Replace the [[-email-]] placeholder with the recipient email address in all attachments
                                for (let i = 0; i < attachments.length; i++) {
                                    const attachment = attachments[i];
                                    const updatedAttachmentContent = attachment.content.toString().replace(/\[\`[-email-]]/g, info.envelope.to[0]);
                                    attachment.content = Buffer.from(updatedAttachmentContent, 'utf-8');
                                    attachment.filename = attachment.filename.replace(/[[-email-]]/g, info.envelope.to[0]);
                                }
                                // Replace the [[-email-]] placeholder with the recipient email address in the recipient list
                                const updatedRecipients = recipients.map(recipient => recipient.replace(/\[\[-email-\]\]/g, info.envelope.to[0]));
                                fs.writeFileSync('list.txt', updatedRecipients.join('\n'));
                            }
                        });
                    }

                    rl.close();
                });
            } else {
                try {
                    for (let i = 0; i < recipients.length; i++) {
                        const message = {
                            from: {
                                name: smtpConfig.from.name,
                                address: smtpConfig.from.email,
                            },
                            to: [recipients[i]],
                            subject: subject.replace(/\[\[-email-\]\]/g, recipients[i]),
                            html: body.replace(/\[\[-email-\]\]/g, recipients[i]),
                            priority: priority || 0,
                        };

                        const info = await new Promise((resolve, reject) => {
                            transporter.sendMail(message, (error, info) => {
                                if (error) {
                                    reject(error);
                                } else {
                                    console.log('Message sent to:', info.envelope.to);
                                    resolve(info);
                                }
                            });
                        });

                        // Replace the [[-email-]] placeholder with the recipient email address in the recipient list
                        const updatedRecipients = recipients.map(recipient => recipient.replace(/\[\[-email-\]\]/g, info.envelope.to[0]));
                        fs.writeFileSync('list.txt', updatedRecipients.join('\n'));
                    }
                } catch (error) {
                    console.log('Error:', error.message);
                } finally {
                    rl.close();
                }
            }
        });
    });
});