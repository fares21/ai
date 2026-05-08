import axios from 'axios';
import { encode } from 'gpt-tokenizer';
import { redisClient }  from '../../infrastructure/redis.client';
import { alertService } from '../../infrastructure/telegram-alert.service';
import { logger }       from '../../infrastructure/logger';

interface AIResponse {
    text: string;
    inputTokens: number;
    outputTokens: number;
    provider: 'deepseek' | 'gemini';
}

export class AIOrchestratorService {

    async processAI(tenantId: number, prompt: string, systemPrompt?: string): Promise<string> {
        const estimatedInput  = encode(prompt + (systemPrompt || '')).length;
        const estimatedOutput = 800;
        const safetyMargin    = Math.ceil((estimatedInput + estimatedOutput) * 0.10);
        const totalReserved   = estimatedInput + estimatedOutput + safetyMargin;

        const budgetKey = `ai:budget:${tenantId}:${new Date().toISOString().split('T')[0]}`;
        const limitKey  = `ai:limit:${tenantId}`;

        let limit = parseInt(await redisClient.get(limitKey) || '0');
        if (!limit) {
            limit = 50000;
            await redisClient.setex(limitKey, 3600, limit.toString());
        }

        const newUsage = await redisClient.incrby(budgetKey, totalReserved);
        if (newUsage === totalReserved) {
            await redisClient.expire(budgetKey, 86400);
        }

        if (newUsage > limit) {
            await redisClient.decrby(budgetKey, totalReserved);
            logger.warn({ tenantId, newUsage, limit }, 'AI budget exceeded');
            throw new Error('تم استنزاف الحصة اليومية من الذكاء الاصطناعي.');
        }

        let result: AIResponse;
        try {
            result = await this.callDeepSeek(prompt, systemPrompt);
        } catch (primaryErr) {
            logger.warn({ tenantId, err: (primaryErr as Error).message }, 'DeepSeek failed — trying Gemini');
            try {
                result = await this.callGemini(prompt, systemPrompt);
            } catch (fallbackErr) {
                await redisClient.decrby(budgetKey, totalReserved);
                await alertService.sendCriticalAlert(
                    `🚨 *جميع مزودات الذكاء الاصطناعي معطلة!*\n` +
                    `المدرسة: \`${tenantId}\`\n` +
                    `DeepSeek: ${(primaryErr as Error).message}\n` +
                    `Gemini: ${(fallbackErr as Error).message}`
                );
                throw new Error('خدمة الذكاء الاصطناعي غير متاحة حالياً. تم إخطار الفريق التقني.');
            }
        }

        const actualTotal = result.inputTokens + result.outputTokens;
        const delta       = actualTotal - totalReserved;
        if (delta !== 0) await redisClient.incrby(budgetKey, delta);

        logger.info({ tenantId, provider: result.provider, actualTotal }, 'AI request completed');
        return result.text;
    }

    private async callDeepSeek(prompt: string, system?: string): Promise<AIResponse> {
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [
                    ...(system ? [{ role: 'system', content: system }] : []),
                    { role: 'user', content: prompt }
                ],
                max_tokens: 1024,
                temperature: 0.7,
            },
            {
                headers: { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
                timeout: 30000,
            }
        );
        const choice = response.data.choices[0];
        return {
            text:         choice.message.content,
            inputTokens:  response.data.usage.prompt_tokens,
            outputTokens: response.data.usage.completion_tokens,
            provider:     'deepseek',
        };
    }

    private async callGemini(prompt: string, system?: string): Promise<AIResponse> {
        const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;
        const response   = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            { contents: [{ parts: [{ text: fullPrompt }] }] },
            { timeout: 30000 }
        );
        const text      = response.data.candidates[0].content.parts[0].text;
        const usageMeta = response.data.usageMetadata;
        return {
            text,
            inputTokens:  usageMeta.promptTokenCount     || encode(fullPrompt).length,
            outputTokens: usageMeta.candidatesTokenCount  || encode(text).length,
            provider:     'gemini',
        };
    }
}

export const aiOrchestrator = new AIOrchestratorService();
