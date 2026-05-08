import axios from 'axios';
import { logger } from './logger';

class TelegramBotService {
    async sendMessage(chatId: string | number, text: string, parseMode = 'Markdown') {
        const token = process.env.SCHOOL_BOT_TOKEN;
        if (!token) { logger.warn('SCHOOL_BOT_TOKEN not set'); return; }
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: parseMode,
        });
    }
}
export const telegramBot = new TelegramBotService();
