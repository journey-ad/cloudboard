import Cookies from 'js-cookie';
import localforage from 'localforage';
import { Dispatch, SetStateAction, useEffect, useLayoutEffect, useState } from 'react';
import packageJson from '../../package.json';
import * as CryptoJS from 'crypto-js';
import clipboard from "tauri-plugin-clipboard-api";
import { notifications } from '@mantine/notifications';
import { NOTIFICATION } from '../constants/notification';
import i18n from '../translations/i18n';
import { exists, readFile } from '@tauri-apps/plugin-fs';

export { localforage };

export const VERSION = packageJson.version;

export const IS_DEVELOPMENT = import.meta.env.MODE === 'development';
export const IS_PRODUCTION = !IS_DEVELOPMENT;

export function useCookie(key: string, defaultValue: string, options: Cookies.CookieAttributes = { expires: 365000, sameSite: 'lax', path: '/' }): [string, Dispatch<SetStateAction<string>>] {
  // cookie expires in a millenia
  // sameSite != 'strict' because the cookie is not read for sensitive actions
  // synchronous
  const cookieValue = Cookies.get(key);
  const [state, setState] = useState(cookieValue || defaultValue);
  useEffect(() => {
    Cookies.set(key, state, options);
  }, [state]);
  return [state, setState];
}

export function trueTypeOf(obj: any) {
  return Object.prototype.toString.call(obj).slice(8, -1).toLowerCase()
  /*
      []              -> array
      {}              -> object
      ''              -> string
      new Date()      -> date
      1               -> number
      function () {}  -> function
      async function () {}  -> asyncfunction
      /test/i         -> regexp
      true            -> boolean
      null            -> null
      trueTypeOf()    -> undefined
  */
}

// https://reactjs.org/docs/hooks-custom.html
export function useLocalForage<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>, boolean] {
  // only supports primitives, arrays, and {} objects
  const [state, setState] = useState(defaultValue);
  const [loading, setLoading] = useState(true);

  // useLayoutEffect will be called before DOM paintings and before useEffect
  useLayoutEffect(() => {
    let allow = true;
    localforage.getItem(key)
      .then(value => {
        if (value === null) throw '';
        if (allow) setState(value as T);
      }).catch(() => localforage.setItem(key, defaultValue))
      .then(() => {
        if (allow) setLoading(false);
      });
    return () => { allow = false; }
  }, []);
  // useLayoutEffect does not like Promise return values.
  useEffect(() => {
    // do not allow setState to be called before data has even been loaded!
    // this prevents overwriting
    if (!loading) localforage.setItem(key, state);
  }, [state]);
  return [state, setState, loading];
}

// show browser / native notification
export function notify(title: string, body: string) {
  new Notification(title, { body: body || "", });
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function downloadFile(filename: string, content: BlobPart, contentType = 'text/plain') {
  const element = document.createElement('a');
  const file = new Blob([content], { type: contentType });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element); // Required for this to work in FireFox
  element.click();
}


export function arraysEqual<T>(a: T[], b: T[]) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  // If you don't care about the order of the elements inside
  // the array, you should sort both arrays here.
  // Please note that calling sort on an array will modify that array.
  // you might want to clone your array first.

  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Joins path segments with a specified separator
 * @param separator The separator to use between segments (e.g., '/', '\', '.')
 * @param segments The path segments to join
 * @returns The joined path string
 */
export function join(separator: string, ...segments: string[]): string | null {
  if (!segments || segments.length === 0) return '';
  if (segments.find(x => !(typeof x === 'string'))) return null;
  return segments.join(separator);
}

/**
 * @description 加密内容
 */
export function encryptContent(content: string, password: string): string {
  return CryptoJS.AES.encrypt(content, password).toString();
};

/**
 * @description 解密内容
 */
export function decryptContent(content: string, password: string): string {
  return CryptoJS.AES.decrypt(content, password).toString(CryptoJS.enc.Utf8) || content;
};

/**
 * @description 读取文件内容
 */
export async function readFileBase64(filePath: string): Promise<string | null> {
  if (!(await exists(filePath))) return null;

  const fileContent = await readFile(filePath);
  if (!fileContent) return null;

  const uint8Array = new Uint8Array(fileContent);
  const binaryString = uint8Array.reduce((str, byte) => str + String.fromCharCode(byte), '');
  return btoa(binaryString);
}

/**
 * @description 读取剪贴板内容
 */
export async function readClipboardData(): Promise<ClipboardData | null> {
  // 检查剪贴板内容类型
  const has = {
    hasText: await clipboard.hasText(),
    hasImage: await clipboard.hasImage(),
    hasHTML: await clipboard.hasHTML(),
    hasRTF: await clipboard.hasRTF(),
    hasFiles: await clipboard.hasFiles(),
  }

  // 按优先级读取不同类型的内容
  const readers = {
    files: async () => {
      const REGEX_IMAGE = /\.png|\.jpg|\.jpeg|\.gif|\.bmp|\.webp$/i;
      const filePath = (await clipboard.readFiles())[0];
      if (!filePath || !REGEX_IMAGE.test(filePath)) return null;

      const fileContent = await readFileBase64(filePath);
      if (!fileContent) return null;

      return {
        type: 'image',
        content: fileContent,
        source: 'local'
      } as ClipboardData;
    },
    image: async () => ({
      type: 'image',
      content: await clipboard.readImageBase64(),
      source: 'local'
    }) as ClipboardData,
    html: async () => ({
      type: 'html',
      content: await clipboard.readHtml(),
      plaintext: await clipboard.readText(),
      source: 'local'
    }) as ClipboardData,
    rtf: async () => ({
      type: 'rtf',
      content: await clipboard.readRtf(),
      source: 'local'
    }) as ClipboardData,
    text: async () => ({
      type: 'text',
      content: await clipboard.readText(),
      source: 'local'
    }) as ClipboardData,
  }

  // 按优先级尝试读取
  if (has.hasFiles) return readers.files();
  if (has.hasImage) return readers.image();
  if (has.hasHTML) return readers.html();
  if (has.hasRTF) return readers.rtf();
  if (has.hasText) return readers.text();

  return null;
};

/**
 * @description 写入剪贴板
 * @param type 剪贴板数据类型
 * @param content 主要内容
 * @param plaintext 纯文本内容（用于html类型的降级显示）
 */
export async function writeToClipboard(type: ClipboardDataType, content: string, plaintext?: string) {
  const writers = {
    files: () => { console.warn('[clipboard] not supported files', content); },
    text: () => clipboard.writeText(content),
    image: () => clipboard.writeImageBase64(content),
    html: () => {
      plaintext = plaintext || htmlToText(content)
      return clipboard.writeHtmlAndText(content, plaintext)
    },
    rtf: () => clipboard.writeRtf(content)
  };

  await writers[type]();
}

/**
 * @description 将HTML字符串转换为纯文本
 * @param htmlString HTML字符串
 * @returns 转换后的纯文本
 */
export function htmlToText(htmlString: string): string {
  if (!htmlString) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  return doc.body.textContent || '';
}

/**
 * @description 格式化字节数
 * @param bytes 字节数
 * @param decimals 小数位数
 * @returns 格式化后的字节数
 */
export function formatBytes(bytes: number, decimals = 2): string {
  bytes = Number(bytes);
  if (isNaN(bytes)) return '';
  if (bytes <= 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * @description 格式化秒数为时分秒
 * @param seconds 秒数
 * @returns 格式化后的时分秒
 */
export const formatSeconds = (seconds: number): string => {
  if (isNaN(seconds)) return '';
  
  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60
  ].map((unit, i) => unit + ('hms'[i] || ''))
    .filter(unit => unit[0] !== '0')
    .join(' ');
};

/**
 * @description 通知类型配置
 */
type NotificationType = 'success' | 'error' | 'warning' | 'info';

/**
 * @description 通知颜色映射
 */
const COLOR_MAP: Record<NotificationType, string> = {
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'blue'
};

/**
 * @description 通知工具对象
 */
type MessageOrOptions = string | { title?: string, message?: string }
export const notification = Object.fromEntries(
  Object.entries(COLOR_MAP).map(([type, color]) => [
    type,
    (messageOrOptions: MessageOrOptions) => {
      const { title, message } = typeof messageOrOptions === 'string' ? { title: undefined, message: messageOrOptions } : messageOrOptions;
      notifications.show({
        title: i18n.t(title || NOTIFICATION[type.toUpperCase() as keyof typeof NOTIFICATION]),
        message: i18n.t(message),
        color
      })
    }
  ])
) as unknown as Record<NotificationType, (messageOrOptions: MessageOrOptions) => void>;
