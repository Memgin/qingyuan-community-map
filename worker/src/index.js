import { handleRequest } from "../../functions/_lib/api.js";

// 独立 Worker 部署入口（如需恢复独立 Worker：wrangler deploy）
export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};
