import { validateRoster } from './roster.mjs?v=2';

export const SHARE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const SHARE_PATTERN = new RegExp('^R[' + SHARE_ALPHABET + ']{11}$');
export const SHARE_DAYS = 30;

export function parseShortCode(input) {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  return SHARE_PATTERN.test(code) ? code : null;
}

async function shareRequest(api, path, options) {
  if (!api) throw new Error('短码服务尚未连接，请使用完整配置码。');
  let response;
  try {
    response = await fetch(api.replace(/\/$/, '') + path, {
      ...options,
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error('暂时连不上短码服务，请稍后再试。');
  }
  if (response.status === 404) throw new Error('短码不存在或已过期，请核对后重试。');
  if (response.status === 413) throw new Error('名单太大，请使用完整配置码。');
  if (response.status === 429) throw new Error('操作太频繁，请稍后再试。');
  if (!response.ok) throw new Error('短码服务暂时不可用，请稍后再试。');
  return response.json();
}

export async function createShortCode(api, roster) {
  const { code } = await shareRequest(api, '/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(roster),
  });
  if (!SHARE_PATTERN.test(code)) throw new Error('短码生成失败，请重试。');
  return code;
}

export async function loadShortCode(api, code) {
  return validateRoster(await shareRequest(api, '/shares/' + code));
}
