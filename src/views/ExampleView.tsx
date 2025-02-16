// component example
import { Anchor, Button, Center, Checkbox, Grid, Group, Loader, PasswordInput, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import * as fs from '@tauri-apps/plugin-fs';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import * as shell from '@tauri-apps/plugin-shell';
import { Trans, useTranslation } from 'react-i18next';
import { notify, join } from '../common/utils';
import { createStorage } from '../tauri/storage';
import { APP_NAME, RUNNING_IN_TAURI, useMinWidth, useTauriContext } from '../tauri/TauriProvider';
import { useCallback, useEffect, useState, useRef } from 'react';
import * as Autostart from '@tauri-apps/plugin-autostart';
import clipboard from "tauri-plugin-clipboard-api";
import * as CryptoJS from 'crypto-js';
import useWebsocketConnection from '../hooks/useWebsocket';

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
  source: ClipboardSource;
}

/**
 * @description 剪贴板内容类型
 */
type ClipboardDataType = 'text' | 'image' | 'html' | 'rtf';

/**
 * @description API相关常量
 */
const API_CONSTANTS = {
  VERSION: '0.1.0',
  DEFAULT_URL: 'https://clip.ovo.re/api/v1',
  URL_REGEX: /^https?:\/\/.*$/
} as const;

function toggleFullscreen() {
  const appWindow = getCurrentWebviewWindow();
  appWindow.isFullscreen().then(x => appWindow.setFullscreen(!x));
}

export default function ExampleView() {
  const { t, i18n } = useTranslation();
  const { fileSep, documents, downloads, loading: tauriLoading } = useTauriContext();
  // do not use Tauri variables on the browser target
  const storeName = RUNNING_IN_TAURI ? join(fileSep, documents!, APP_NAME, 'example_view.dat') : 'example_view';
  // store-plugin will create necessary directories
  const { use: useKVP, loading, data } = createStorage(storeName);

  /**
   * @description 管理API相关状态的hook
   */
  const useApiState = () => {
    const defaultUrl = API_CONSTANTS.DEFAULT_URL;
    const [apiBaseUrl, setApiBaseUrl] = useKVP('apiBaseUrl', defaultUrl);
    const [tmpApiBaseUrl, setTmpApiBaseUrl] = useState(apiBaseUrl);
    const [apiKey, setApiKey] = useKVP('apiKey', '');
    const [apiKeyLoading, setApiKeyLoading] = useState(false);

    const apiBaseUrlRef = useRef(apiBaseUrl);
    const apiKeyRef = useRef(apiKey);

    useEffect(() => {
      apiBaseUrlRef.current = apiBaseUrl;
      apiKeyRef.current = apiKey;
    }, [apiBaseUrl, apiKey]);

    return {
      apiBaseUrl,
      setApiBaseUrl,
      tmpApiBaseUrl,
      setTmpApiBaseUrl,
      apiKey,
      setApiKey,
      apiKeyLoading,
      setApiKeyLoading,
      apiBaseUrlRef,
      apiKeyRef
    };
  };

  // 使用hook获取API状态
  const apiState = useApiState();

  const isCloudboardChangeRef = useRef(false);

  const systemLanguage = navigator.language.split('-')[0];

  const [language, setLanguage] = useKVP('language', systemLanguage);
  const changeLanguage = (lang: string) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  }

  const changeApiBaseUrl = useCallback((url: string) => {
    const REGEX = /^https?:\/\/.*$/;
    if (!REGEX.test(url)) {
      notifications.show({
        title: 'Error',
        message: 'Invalid API Endpoint',
        color: 'red'
      });
      return;
    }

    apiState.setApiBaseUrl(url);
  }, [apiState.setApiBaseUrl]);

  useEffect(() => {
    if (loading) {
      return;
    }

    apiState.apiBaseUrlRef.current = apiState.apiBaseUrl;
    apiState.apiKeyRef.current = apiState.apiKey;

    console.log('[ExampleView] useEffect', apiState.apiBaseUrl, apiState.apiKey);
  }, [loading, apiState.apiBaseUrl, apiState.apiKey]);

  useEffect(() => {
    apiState.apiBaseUrlRef.current = apiState.apiBaseUrl;
    if (apiState.apiBaseUrl && apiState.apiBaseUrl !== apiState.tmpApiBaseUrl) {
      apiState.setTmpApiBaseUrl(apiState.apiBaseUrl);
    }
  }, [apiState.apiBaseUrl]);

  const [endToEndEncryption, setEndToEndEncryption] = useKVP('endToEndEncryption', false);
  const [endToEndEncryptionPassword, setEndToEndEncryptionPassword] = useKVP('endToEndEncryptionPassword', '');

  // 获取API密钥
  const fetchApiKey = useCallback(async () => {
    try {
      apiState.setApiKeyLoading(true);
      const response = await fetch(`${apiState.apiBaseUrlRef.current}/key-gen`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Cloudboard-Version': '0.1.0'
        }
      });
      const data = await response.json();
      apiState.setApiKey(data.key);
      apiState.setApiKeyLoading(false);
    } catch (error) {
      console.error('Failed to get API key:', error);
      notifications.show({
        title: 'Error',
        message: `操作失败: ${error}`,
        color: 'red'
      });
    }
  }, [apiState.setApiKey]);

  const getApiKey = useCallback(async () => {
    if (apiState.apiKeyLoading) {
      return;
    }

    if (!apiState.apiKey) {
      await fetchApiKey();
    }

    // 写入剪贴板
    await clipboard.writeText(apiState.apiKey);
    notifications.show({
      title: t('Success'),
      message: t('API Key has been copied to the clipboard'),
      color: 'green'
    });
  }, [fetchApiKey, apiState.apiKeyLoading, apiState.apiKey]);

  const [startAtLogin, setStartAtLogin] = useState(false);

  useEffect(() => {
    const setAutostart = async () => {
      try {
        if (startAtLogin) {
          await Autostart.enable();
          setStartAtLogin(await Autostart.isEnabled());
        } else {
          await Autostart.disable();
          setStartAtLogin(await Autostart.isEnabled());
        }
      } catch (error) {
        console.error('设置开机启动失败:', error);
      }
    };

    setAutostart();
  }, [startAtLogin, setStartAtLogin]);

  /**
   * 使用WebSocket连接
   * @param {object} props WebSocket配置
   * @param {boolean} shouldConnect 是否应该连接
   */
  const { socket, isConnected } = useWebsocketConnection({
    url: new URL(apiState.apiBaseUrlRef.current).host
  }, !loading);

  // 监听云端剪贴板变化
  useEffect(() => {
    if (isConnected) {
      console.log('socket connected');

      socket?.emit('auth', apiState.apiKey);
      socket?.on('clipboard:sync', async (data) => {
        console.log('[clipboard] recv ===============>', data);

        const clipboardData: ClipboardData = {
          type: data.type,
          content: data.content,
          source: 'remote'
        };

        await handleClipboardData(clipboardData);
      });
    }
  }, [isConnected, socket, apiState.apiKey]);

  // 监听本地剪贴板变化
  const isListeningRef = useRef(false);
  useEffect(() => {
    if (isListeningRef.current) {
      return;
    }
    isListeningRef.current = true;

    console.log('[clipboard] useEffect');
    let unlistenUpdate: () => void;
    let unlistenStart: () => void;

    const setupClipboardListeners = async () => {
      try {
        unlistenUpdate = await clipboard.onClipboardUpdate(async () => {
          console.log('[clipboard] onClipboardUpdate');

          // 如果是远程数据触发的变化,跳过处理
          if (isCloudboardChangeRef.current) {
            console.log('[clipboard] skip remote change');
            isCloudboardChangeRef.current = false;
            return;
          }

          const has = {
            hasText: await clipboard.hasText(),
            hasImage: await clipboard.hasImage(),
            hasHTML: await clipboard.hasHTML(),
            hasRTF: await clipboard.hasRTF(),
            hasFiles: await clipboard.hasFiles(),
          }

          let clipboardData: ClipboardData | null = null;

          if (has.hasText) {
            const text = await clipboard.readText();
            clipboardData = {
              type: 'text',
              content: text,
              source: 'local'
            };
          } else if (has.hasImage) {
            const image = await clipboard.readImageBase64();
            clipboardData = {
              type: 'image',
              content: image,
              source: 'local'
            };
          } else if (has.hasHTML) {
            const html = await clipboard.readHtml();
            clipboardData = {
              type: 'html',
              content: html,
              source: 'local'
            };
          } else if (has.hasRTF) {
            const rtf = await clipboard.readRtf();
            clipboardData = {
              type: 'rtf',
              content: rtf,
              source: 'local'
            };
          }

          if (clipboardData) {
            await handleClipboardData(clipboardData);
          }
        });

        unlistenStart = await clipboard.startListening();
        isListeningRef.current = false;
      } catch (error) {
        console.error('[clipboard] setup error:', error);
      }
    };

    setupClipboardListeners();

    return () => {
      unlistenUpdate?.();
      unlistenStart?.();
    }
  }, []);

  // 上传剪贴板内容
  const uploadClipboard = useCallback(async ({ type, content }: { type: string, content: string }) => {
    try {
      const response = await fetch(`${apiState.apiBaseUrlRef.current}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cloudboard-Version': '0.1.0'
        },
        body: JSON.stringify({
          type,
          content,
          key: apiState.apiKeyRef.current
        })
      });
      const data = await response.json();
      console.log('[clipboard] upload', data);
    } catch (error) {
      console.error('[clipboard] failed to upload clipboard:', error);
    }
  }, [loading]);

  // 添加一个引用来存储最后处理的内容
  const lastContentRef = useRef<string>('');

  // 添加引用来存储加密相关的状态
  const endToEndEncryptionRef = useRef(endToEndEncryption);
  const endToEndEncryptionPasswordRef = useRef(endToEndEncryptionPassword);

  // 更新引用值
  useEffect(() => {
    endToEndEncryptionRef.current = endToEndEncryption;
    endToEndEncryptionPasswordRef.current = endToEndEncryptionPassword;
  }, [endToEndEncryption, endToEndEncryptionPassword]);

  /**
   * @description 加密内容
   */
  const encryptContent = (content: string, password: string): string => {
    const encrypted = CryptoJS.AES.encrypt(content, password).toString();
    console.log('[clipboard] encryptContent', content, encrypted);
    return encrypted;
  };

  /**
   * @description 解密内容
   */
  const decryptContent = (content: string, password: string): string => {
    const decrypted = CryptoJS.AES.decrypt(content, password).toString(CryptoJS.enc.Utf8) || content;
    console.log('[clipboard] decryptContent', content, decrypted);
    return decrypted;
  };

  /**
   * @description 写入剪贴板
   */
  const writeToClipboard = async (type: ClipboardDataType, content: string) => {
    const writers = {
      text: () => clipboard.writeText(content),
      image: () => clipboard.writeImageBase64(content),
      html: () => clipboard.writeHtml(content),
      rtf: () => clipboard.writeRtf(content)
    };

    await writers[type]();
  };

  /**
   * @description 处理剪贴板数据
   */
  const handleClipboardData = useCallback(async (data: ClipboardData) => {
    const { type, content, source } = data;

    // 处理内容
    const processedContent = source === 'remote' && endToEndEncryptionRef.current
      ? decryptContent(content, endToEndEncryptionPasswordRef.current)
      : content;

    // 跳过重复内容
    if (processedContent === lastContentRef.current) {
      console.log('[clipboard] skip duplicate content');
      return;
    }

    lastContentRef.current = processedContent;

    // 设置远程变更标记
    if (source === 'remote') {
      isCloudboardChangeRef.current = true;
    }

    // 写入剪贴板
    try {
      await writeToClipboard(type as ClipboardDataType, processedContent);
    } catch (error) {
      console.error('[clipboard] failed to write clipboard:', error);
      return;
    }

    // 同步到云端
    if (source === 'local') {
      const uploadContent = endToEndEncryptionRef.current
        ? encryptContent(processedContent, endToEndEncryptionPasswordRef.current)
        : processedContent;

      await uploadClipboard({
        type,
        content: uploadContent
      });
    }
  }, []);

  if (tauriLoading || loading) {
    return <Center h={'100%'}>
      <Loader />
    </Center>
  }

  // <> is an alias for <React.Fragment>
  return <Stack h={'100%'} gap={'sm'}>
    <Group justify='end' wrap="nowrap" gap="xs" style={{ marginBottom: '-.5rem' }}>
      <Anchor size={'xs'} c={language === 'en_US' ? 'blue' : 'dimmed'} onClick={() => changeLanguage('en_US')}>EN</Anchor>
      <Anchor size={'xs'} c={language === 'zh_CN' ? 'blue' : 'dimmed'} onClick={() => changeLanguage('zh_CN')}>中文</Anchor>
    </Group>

    <Text size={'sm'} style={{ marginBottom: '-.5rem' }}>{t('API Endpoint')}</Text>
    <Group justify="space-between" wrap="nowrap">
      <div style={{ width: '100%' }}>
        <TextInput placeholder={t('Input API Endpoint')} value={apiState.tmpApiBaseUrl} onBlur={() => changeApiBaseUrl(apiState.tmpApiBaseUrl)} onChange={e => apiState.setTmpApiBaseUrl(e.currentTarget.value.trim())} />
      </div>
      <Button size='xs' loading={apiState.apiKeyLoading} onClick={getApiKey} style={{ flexShrink: 0 }}>{t('Get-Key')}</Button>
    </Group>

    <Text size={'sm'} style={{ marginBottom: '-.5rem' }}>{t('End-to-End Encryption')}</Text>
    <Group justify="space-between" wrap="nowrap">
      <div style={{ width: '100%' }}>
        <PasswordInput placeholder={t('Input End-to-End Password')} value={endToEndEncryptionPassword} minLength={6} maxLength={32} required onChange={e => setEndToEndEncryptionPassword(e.currentTarget.value)} disabled={!endToEndEncryption} />
      </div>
      <Switch onLabel={t('ON')} offLabel={t('OFF')} size="lg" checked={endToEndEncryption} onChange={e => setEndToEndEncryption(e.currentTarget.checked)} />
    </Group>

    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="sm">{t('Start at Login')}</Text>
        <Text size="xs" c="dimmed">
          {t('It will start automatically when the system starts')}
        </Text>
      </div>
      <Switch onLabel={t('ON')} offLabel={t('OFF')} size="lg" checked={startAtLogin} onChange={e => setStartAtLogin(e.currentTarget.checked)} />
    </Group>

    <Group style={{ marginTop: 'auto', marginBottom: '-.3rem' }} justify="center" wrap="nowrap" gap="xs">
      <Text size="xs" c="dimmed">Cloudboard v{t('0.1')}</Text>
      <Text size="xs" c="dimmed">
        <Anchor c="dimmed" href='https://github.com/journey-ad/cloudboard' target='_blank' >{t('Github')}</Anchor>
      </Text>
    </Group>

  </Stack>
}
