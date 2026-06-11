/**
 * 统一 API 配置
 * - Render 一体部署：前后端同域，使用 /api
 * - 本地开发：前端 8080 + 后端 5001 时自动指向 localhost:5001
 * - 本地一体：Flask 托管前端在 5001 时走同域 /api
 */
function resolveApiBase() {
  const { hostname, port, origin } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocal && port && port !== '5001') {
    return 'http://localhost:5001/api';
  }
  return `${origin}/api`;
}

export const API_BASE = resolveApiBase();
