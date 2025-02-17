/**
 * @description API相关常量
 */
export const API_CONSTANTS = {
  VERSION: '0.1.0',
  DEFAULT_URL: 'https://clip.ovo.re/api/v1',
  URL_REGEX: /^https?:\/\/.*$/
} as const;

/**
 * @description 密码相关常量
 */
export const PASSWORD_CONSTANTS = {
  MIN_LENGTH: 6,
  MAX_LENGTH: 32
} as const;
