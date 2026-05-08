import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInitData, useLaunchParams } from '@telegram-apps/sdk-react';

// ── Types ────────────────────────────────────────────────────
type Status = 'present' | 'absent' | 'late' | 'excused';
type FeedbackState = { type: 'success' | 'error'; message: string } | null;

// ── Helpers ──────────────────────────────────────────────────
const STATUS_LABELS: Record<Status, string> = {
    present: 'حضور ✅',
    absent:  'غياب ❌',
    late:    'تأخر ⏰',
    excused: 'عذر 📋',
};

const STATUS_COLORS: Record<Status, string> = {
    present: 'bg-emerald-500 active:bg-emerald-600',
    absent:  'bg-red-500    active:bg-red-600',
    late:    'bg-amber-500  active:bg-amber-600',
    excused: 'bg-blue-500   active:bg-blue-600',
};

// ── Main Component ────────────────────────────────────────────
export const CheckIn: React.FC = () => {
    const initData = useInitData();
    const [code,     setCode]     = useState('');
    const [loading,  setLoading]  = useState(false);
    const [feedback, setFeedback] = useState<FeedbackState>(null);
    const [history,  setHistory]  = useState<Array<{ code: string; status: Status; time: string }>>([]);

    const markAttendance = useCallback(async (status: Status) => {
        if (!code.trim()) { setFeedback({ type: 'error', message: 'أدخل رقم الطالب أولاً' }); return; }
        if (loading) return;

        const prevCode = code;
        // Optimistic UI: clear input immediately
        setCode('');
        setLoading(true);

        try {
            const res = await fetch('/api/attendance', {
                method:  'POST',
                headers: {
                    'Content-Type':           'application/json',
                    'X-Telegram-Init-Data':   initData?.raw || '',
                },
                body: JSON.stringify({ studentCode: prevCode.trim(), status }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'فشل في التسجيل');
            }

            const time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
            setHistory(h => [{ code: prevCode, status, time }, ...h].slice(0, 10));
            setFeedback({ type: 'success', message: `تم تسجيل ${STATUS_LABELS[status]}` });

        } catch (err: any) {
            setFeedback({ type: 'error', message: err.message });
            setCode(prevCode); // restore on failure
        } finally {
            setLoading(false);
            setTimeout(() => setFeedback(null), 2500);
        }
    }, [code, loading, initData]);

    return (
        <div
            dir="rtl"
            className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900
                       text-white p-4 font-sans select-none"
        >
            {/* Header */}
            <div className="text-center mb-6">
                <h1 className="text-2xl font-bold tracking-tight">🏫 المراقب الميداني</h1>
                <p className="text-white/60 text-sm mt-1">سجّل حضور الطلاب بسرعة</p>
            </div>

            {/* Input Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 mb-4 shadow-2xl"
            >
                <label className="block text-white/70 text-sm mb-2 font-medium">رقم الطالب</label>
                <input
                    type="number"
                    inputMode="numeric"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && markAttendance('present')}
                    placeholder="أدخل الرقم هنا..."
                    className="w-full text-center text-4xl font-bold py-4 px-4 rounded-2xl
                               bg-white/10 border border-white/20 focus:outline-none
                               focus:ring-2 focus:ring-white/50 placeholder-white/30
                               transition-all"
                />
            </motion.div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                {(['present','absent','late','excused'] as Status[]).map(s => (
                    <motion.button
                        key={s}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => markAttendance(s)}
                        disabled={loading}
                        className={`${STATUS_COLORS[s]} text-white font-bold text-lg py-5
                                   rounded-2xl shadow-lg transition-all disabled:opacity-50`}
                    >
                        {STATUS_LABELS[s]}
                    </motion.button>
                ))}
            </div>

            {/* Feedback Toast */}
            <AnimatePresence>
                {feedback && (
                    <motion.div
                        key="toast"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`text-center py-3 px-4 rounded-2xl font-semibold mb-4 ${
                            feedback.type === 'success'
                                ? 'bg-emerald-500/90'
                                : 'bg-red-500/90'
                        }`}
                    >
                        {feedback.message}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Recent History */}
            {history.length > 0 && (
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
                    <h3 className="text-white/70 text-sm font-medium mb-3">آخر التسجيلات</h3>
                    <div className="space-y-2">
                        {history.map((h, i) => (
                            <div key={i} className="flex justify-between items-center text-sm">
                                <span className="font-mono bg-white/10 px-2 py-0.5 rounded-lg">{h.code}</span>
                                <span>{STATUS_LABELS[h.status]}</span>
                                <span className="text-white/50">{h.time}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CheckIn;
