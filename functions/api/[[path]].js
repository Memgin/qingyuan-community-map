import { handleRequest } from "../_lib/api.js";

// Pages Functions 入口：捕获所有 /api/* 请求（含 OPTIONS 预检）
export const onRequest = async (context) => handleRequest(context.request, context.env);
