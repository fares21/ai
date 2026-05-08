import axios from 'axios';

class TelegramAlertService {
    async sendCriticalAlert(message: string): Promise<void> {
        const token  = process.env.SUPERADMIN_BOT_TOKEN;
        const chatId = process.env.SUPERADMIN_CHAT_ID;
        if (!token || !chatId) { console.error('Alert: missing SUPERADMIN_BOT_TOKEN or SUPERADMIN_CHAT_ID'); return; }
        try {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId, text: message, parse_mode: 'Markdown',
            });
        } catch (err) {
            console.error('Failed to send critical Telegram alert:', err);
        }
    }
}
export const alertService = new TelegramAlertService();
