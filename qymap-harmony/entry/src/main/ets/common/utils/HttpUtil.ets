/**
 * HTTP 网络层封装。
 *
 * 原生应用发出的请求不受浏览器同源策略限制，因此可以直接调用后端
 * https://qymap.pages.dev/api ，无需后端做任何改动。
 *
 * 这里统一处理：
 * - 超时（连接 15s / 读取 20s）
 * - 统一把非 2xx 响应转换为 ApiError（携带后端返回的中文 error 文案）
 * - 请求对象的创建与销毁，避免内存泄漏
 */
import { http } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'QyMapHttp';

/** 后端返回的错误体 */
interface ErrorDto {
  error?: string;
}

/** 业务异常：携带 HTTP 状态码，页面据此做差异化处理（401 引导登录、409 提示重复等） */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 原始响应 */
export class RawResponse {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    this.status = status;
    this.body = body;
  }
}

/** 拼接查询串，value 会做 URL 编码 */
export function buildUrl(path: string, query?: Record<string, string>): string {
  if (query === undefined) {
    return path;
  }
  const keys: string[] = Object.keys(query);
  if (keys.length === 0) {
    return path;
  }
  const parts: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key: string = keys[i];
    parts.push(`${key}=${encodeURIComponent(query[key])}`);
  }
  return `${path}?${parts.join('&')}`;
}

/** 统一发送请求 */
async function send(method: http.RequestMethod, url: string, header: Record<string, string>,
  extraData?: string | ArrayBuffer): Promise<RawResponse> {
  const request = http.createHttp();
  try {
    const options: http.HttpRequestOptions = {
      method: method,
      header: header,
      connectTimeout: 15000,
      readTimeout: 20000,
      expectDataType: http.HttpDataType.STRING,
      usingCache: false
    };
    if (extraData !== undefined) {
      options.extraData = extraData;
    }
    const response = await request.request(url, options);
    const result: string | Object | ArrayBuffer = response.result;
    let body: string = '';
    if (typeof result === 'string') {
      body = result;
    } else {
      body = JSON.stringify(result);
    }
    const status: number = response.responseCode as number;
    return new RawResponse(status, body);
  } finally {
    request.destroy();
  }
}

/** GET 请求 */
export async function httpGet(url: string, header: Record<string, string>): Promise<RawResponse> {
  return await send(http.RequestMethod.GET, url, header);
}

/** POST JSON */
export async function httpPostJson(url: string, json: string,
  header: Record<string, string>): Promise<RawResponse> {
  return await send(http.RequestMethod.POST, url, header, json);
}

/** DELETE 请求 */
export async function httpDelete(url: string, header: Record<string, string>): Promise<RawResponse> {
  return await send(http.RequestMethod.DELETE, url, header);
}

/** POST 二进制体（图片上传） */
export async function httpPostBinary(url: string, data: ArrayBuffer, contentType: string,
  header: Record<string, string>): Promise<RawResponse> {
  const merged: Record<string, string> = {};
  const keys: string[] = Object.keys(header);
  for (let i = 0; i < keys.length; i++) {
    merged[keys[i]] = header[keys[i]];
  }
  merged['Content-Type'] = contentType;
  return await send(http.RequestMethod.POST, url, merged, data);
}

/**
 * 把响应体解析为目标类型；当 HTTP 状态码不在 2xx 区间时，
 * 优先使用后端返回的 error 文案抛出 ApiError。
 */
export function parseResponse<T>(response: RawResponse): T {
  if (response.status >= 200 && response.status < 300) {
    if (response.body.length === 0) {
      throw new ApiError(response.status, '服务返回了空内容');
    }
    return JSON.parse(response.body) as T;
  }
  let message: string = `请求失败（HTTP ${response.status}）`;
  try {
    const parsed: ErrorDto = JSON.parse(response.body) as ErrorDto;
    if (parsed.error !== undefined && parsed.error.length > 0) {
      message = parsed.error;
    }
  } catch (err) {
    const error = err as BusinessError;
    hilog.warn(DOMAIN, TAG, 'error body is not json: %{public}s', error.message);
  }
  throw new ApiError(response.status, message);
}

/** 把异常转换为可展示的文案 */
export function describeError(err: Object): string {
  if (err instanceof ApiError) {
    return (err as ApiError).message;
  }
  const error = err as BusinessError;
  if (error !== undefined && error.message !== undefined && error.message.length > 0) {
    return `网络异常：${error.message}`;
  }
  return '网络异常，请检查网络后重试';
}
