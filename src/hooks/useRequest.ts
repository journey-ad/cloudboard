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
  run: (url: string, options?: RequestOptions) => Promise<TData | null>;
}

/**
 * @description 请求hook
 * @template TData 返回数据类型
 * @param defaultOptions 默认配置
 */
export function useRequest<TData = any>(
  defaultOptions: RequestOptions = {}
): UseRequestReturn<TData> {
  const [data, setData] = useState<TData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async (
    url: string,
    options: RequestOptions = {}
  ): Promise<TData | null> => {
    const finalOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Cloudboard-Version': '0.1.0',
        ...defaultOptions.headers,
        ...options.headers,
      }
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

      const response = await fetch(url, fetchOptions);
      
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
  }, [defaultOptions]);

  return {
    data,
    loading,
    error,
    run
  };
} 