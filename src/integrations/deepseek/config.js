export const deepseekConfig = {
  baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  maxReplyChars: Number(process.env.DEEPSEEK_MAX_REPLY_CHARS ?? 30),
  systemPrompt:
    process.env.DEEPSEEK_SYSTEM_PROMPT ??
    "你是语音播报助手。请用中文回答,不超过30个字,只输出可直接播报的内容,不要表情,不要 Markdown。",
};
