/**
 * @description 通用请求hook
 */
import { useState, useCallback } from 'react';
import { notifications } from '@mantine/notifications';

interface RequestOptions extends RequestInit {
  showError?: boolean;
  showSuccess?: boolean;
  successMessage?: string;
}

interface UseRequestReturn<TData> {
  /**
   * @description 数据
   */
  data: TData | null;
  /**
   * @description 加载状态
   */
  loading: boolean;
  /**
   * @description 错误信息
   */
  error: Error | null;
  /**
   * @description 执行请求
   */
  run: (urlOrOptions?: string | RequestOptions, options?: RequestOptions) => Promise<TData | null>;
}

/**
 * @description 请求hook
 * @template TData 返回数据类型
 * @param url 请求URL
 * @param defaultOptions 默认配置
 */
export function useRequest<TData = any>(
  url?: string,
  defaultOptions: RequestOptions = {}
): UseRequestReturn<TData> {
  const [data, setData] = useState<TData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async (
    urlOrOptions?: string | RequestOptions,
    options?: RequestOptions
  ): Promise<TData | null> => {
    // 处理参数
    let finalUrl = '';
    let finalOptions = { ...defaultOptions };

    if (typeof urlOrOptions === 'string') {
      finalUrl = urlOrOptions;
      finalOptions = { ...finalOptions, ...options };
    } else {
      if (!url) throw new Error('URL is required');
      finalUrl = url;
      finalOptions = { ...finalOptions, ...urlOrOptions };
    }

    finalOptions.headers = {
      'Content-Type': 'application/json',
      'X-Cloudboard-Version': '0.1.0',
      ...defaultOptions.headers,
      ...finalOptions.headers,
    };

    const {
      showError = true,
      showSuccess = false,
      successMessage = '操作成功',
      ...fetchOptions
    } = finalOptions;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(finalUrl, fetchOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      setData(result);

      if (showSuccess) {
        notifications.show({
          title: '成功',
          message: successMessage,
          color: 'green'
        });
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      
      if (showError) {
        notifications.show({
          title: '错误',
          message: `请求失败: ${error.message}`,
          color: 'red'
        });
      }
      
      return null;
    } finally {
      setLoading(false);
    }
  }, [url, defaultOptions]);

  return {
    data,
    loading,
    error,
    run
  };
} 