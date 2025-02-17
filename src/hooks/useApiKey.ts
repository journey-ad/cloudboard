/**
 * @description API密钥管理hook
 */
import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import clipboard from "tauri-plugin-clipboard-api";
import { useTranslation } from 'react-i18next';
import { useRequest } from './useRequest';

interface UseApiKeyProps {
  apiBaseUrlRef: React.MutableRefObject<string>;
  apiKey: string;
  setApiKey: (key: string) => void;
}

interface ApiKeyResponse {
  key: string;
}

export const useApiKey = ({
  apiBaseUrlRef,
  apiKey,
  setApiKey,
}: UseApiKeyProps) => {
  const { t } = useTranslation();
  const { run, loading } = useRequest<ApiKeyResponse>();

  /**
   * @description 获取并复制API密钥
   */
  const getApiKey = useCallback(async () => {
    if (loading) {
      return;
    }

    if (!apiKey) {
      const result = await run(`${apiBaseUrlRef.current}/key-gen`);
      if (result) {
        setApiKey(result.key);
      }
    }

    // 写入剪贴板
    await clipboard.writeText(apiKey);
    notifications.show({
      title: t('Success'),
      message: t('API Key has been copied to the clipboard'),
      color: 'green'
    });
  }, [run, loading, apiKey, apiBaseUrlRef, setApiKey]);

  return {
    getApiKey,
    loading
  };
}; 