/**
 * @description 剪贴板数据来源类型
 */
type ClipboardSource = 'local' | 'remote';

/**
 * @description 剪贴板数据类型
 */
interface ClipboardData {
  type: ClipboardDataType;
  content: string;
  plaintext?: string | undefined;
  source: ClipboardSource;
}

/**
 * @description 剪贴板内容类型
 */
type ClipboardDataType = 'text' | 'image' | 'html' | 'rtf';
