// component example
import { Anchor, Button, Center, Checkbox, Grid, Group, Loader, PasswordInput, Stack, Switch, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { TbFingerprint } from 'react-icons/tb';
import { Trans, useTranslation } from 'react-i18next';
import { notify, join, decryptContent, encryptContent, writeToClipboard, readClipboardData } from '../common/utils';
import { createStorage } from '../tauri/storage';
import { APP_NAME, RUNNING_IN_TAURI, useMinWidth, useTauriContext } from '../tauri/TauriProvider';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import * as Autostart from '@tauri-apps/plugin-autostart';
import clipboard from "tauri-plugin-clipboard-api";
import useWebsocketConnection from '../hooks/useWebsocket';
import { API_CONSTANTS, PASSWORD_CONSTANTS, SOCKET_CONFIG } from '../constants';
import { useRequest } from '../hooks/useRequest';
import { debounce } from 'lodash-es';


export default function MainView() {
  const { t, i18n } = useTranslation();
  const { fileSep, documents, loading: tauriLoading } = useTauriContext();

  // 存储相关初始化
  const storeName = RUNNING_IN_TAURI ? join(fileSep, documents!, APP_NAME, 'config.dat') : 'config';
  const { use: useKVP, loading, data } = createStorage(storeName);

  /**
   * @description API URL管理
   */
  const useApiUrl = () => {
    const [apiBaseUrl, setApiBaseUrl] = useKVP('apiBaseUrl', API_CONSTANTS.DEFAULT_URL);
    const apiBaseUrlRef = useRef(apiBaseUrl);

    // 临时URL状态（仅用于输入框）
    const [tmpUrl, setTmpUrl] = useState(apiBaseUrl);

    useEffect(() => {
      apiBaseUrlRef.current = apiBaseUrl;
      if (apiBaseUrl !== tmpUrl) {
        setTmpUrl(apiBaseUrl);
      }
    }, [apiBaseUrl]);

    return {
      apiBaseUrl,
      setApiBaseUrl,
      tmpUrl,
      setTmpUrl,
      apiBaseUrlRef
    };
  };

  /**
   * @description API Key管理
   */
  const useApiKey = () => {
    const [apiKey, setApiKey] = useKVP('apiKey', '');
    const apiKeyRef = useRef(apiKey);

    useEffect(() => {
      apiKeyRef.current = apiKey;
    }, [apiKey]);

    return {
      apiKey,
      setApiKey,
      apiKeyRef
    };
  };

  const { apiBaseUrl, setApiBaseUrl, tmpUrl, setTmpUrl, apiBaseUrlRef } = useApiUrl();
  const { apiKey, setApiKey, apiKeyRef } = useApiKey();
  const [apiConfig, setApiConfig] = useState<ConfigResponse | null>(null);

  const apiEndpoint = useMemo(() => {
    return {
      keyGen: `${apiBaseUrlRef.current}/key-gen`,
      config: `${apiBaseUrlRef.current}/config`,
      sync: `${apiBaseUrlRef.current}/sync`
    }
  }, [apiBaseUrlRef]);

  const { run: runGetApiKey, loading: apiKeyLoading } = useRequest<ApiKeyResponse>(apiEndpoint.keyGen);
  const { run: runGetConfig } = useRequest<ConfigResponse>(apiEndpoint.config);

  const getConfig = useCallback(async () => {
    const result = await runGetConfig();
    if (result) {
      setApiConfig(result);
    } else {
      throw new Error('Failed to get API Config');
    }
  }, [runGetConfig]);

  /**
   * @description 获取并复制API密钥
   */
  const getApiKey = useCallback(async () => {
    if (apiKeyLoading) {
      return;
    }

    if (!apiKey) {
      const result = await runGetApiKey();
      if (result) {
        setApiKey(result.key);
      } else {
        return;
      }
    }

    // 写入剪贴板
    await clipboard.writeText(apiKey);
    notifications.show({
      title: t('Success'),
      message: t('API Key has been copied to the clipboard'),
      color: 'green'
    });
  }, [apiKeyLoading, apiKey, apiBaseUrlRef, setApiKey, runGetApiKey]);

  /**
   * @description 更新API基础URL
   */
  const changeApiBaseUrl = useCallback(async (url: string) => {
    try {
      const REGEX = /^https?:\/\/.*$/;
      const parsedUrl = new URL(url);

      if (!REGEX.test(parsedUrl.toString())) {
        throw new Error('Invalid API Endpoint');
      }

      apiBaseUrlRef.current = parsedUrl.toString();
      // setApiBaseUrl(parsedUrl.toString());
      // setTmpUrl(parsedUrl.toString());
    } catch (error) {
      console.error('[MainView] changeApiBaseUrl error:', error);
      notifications.show({
        title: t('Error'),
        message: t('Invalid API Endpoint'),
        color: 'red',
      });
      return;
    }
  }, [setApiBaseUrl, apiBaseUrlRef]);

  const systemLanguage = navigator.language.split('-')[0];
  const [language, setLanguage] = useKVP('language', systemLanguage);
  const changeLanguage = (lang: string) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  }

  useEffect(() => {
    if (tauriLoading || loading) {
      return;
    }

    apiBaseUrlRef.current = apiBaseUrl;
    apiKeyRef.current = apiKey;
    getConfig();
    console.log('[MainView] useEffect', apiBaseUrlRef.current, apiKeyRef.current);
  }, [tauriLoading, loading, apiBaseUrl, apiKey]);

  useEffect(() => {
    apiBaseUrlRef.current = apiBaseUrl;
    if (apiBaseUrl && apiBaseUrl !== tmpUrl) {
      setTmpUrl(apiBaseUrl);
    }
  }, [apiBaseUrl]);

  /**
   * @description 端到端加密
   */
  const [enableE2E, setEnableE2E] = useKVP('enableE2E', false);
  const [password, setPassword] = useKVP('e2ePassword', '');
  const checkPassword = useCallback((password: string) => {
    if (password.length < PASSWORD_CONSTANTS.MIN_LENGTH || password.length > PASSWORD_CONSTANTS.MAX_LENGTH) {
      notifications.show({
        title: 'Error',
        message: 'Password must be between 6 and 32 characters',
        color: 'red'
      });
      return false;
    }

    setPassword(password);
    return true;
  }, []);

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


  const wsUrl = useMemo(() => {
    return new URL(apiBaseUrl).origin;
  }, [apiBaseUrl]);

  /**
   * 使用WebSocket连接
   * @param {object} props WebSocket配置
   * @param {boolean} shouldConnect 是否应该连接
   */
  const { socket, socketRef, isConnecting, isConnected, error } = useWebsocketConnection({
    url: wsUrl
  }, !loading);

  // 获取当前状态
  const socketState = useMemo(() => {
    if (isConnecting) return SOCKET_CONFIG.CONNECTING;
    if (isConnected) return SOCKET_CONFIG.CONNECTED;
    if (error) return SOCKET_CONFIG.ERROR;
    return SOCKET_CONFIG.DISCONNECTED;
  }, [isConnected, isConnecting, error]);

  // 获取状态文本和颜色
  const { text: socketStateText, color: socketStateColor } = useMemo(() => ({
    text: t(socketState.text),
    color: socketState.color
  }), [socketState, t]);

  // 监听云端剪贴板变化
  useEffect(() => {
    if (isConnected) {
      console.log('socket connected');

      socket?.emit('auth', apiKeyRef.current);
      socket?.on('clipboard:sync', async (data) => {
        if (data.sourceId === socket.id) return

        console.log('[clipboard] recv ===============>', data);

        const clipboardData: ClipboardData = {
          type: data.type,
          content: data.content,
          source: 'remote'
        };

        await handleClipboardData(clipboardData);
      });
    }
  }, [isConnected, socket, apiKeyRef.current]);

  const isProgramWriteRef = useRef(false);
  // 监听本地剪贴板变化
  const isListening = useRef(false);

  useEffect(() => {
    if (isListening.current) {
      return;
    }
    isListening.current = true;

    console.log('[clipboard] useEffect');
    let unlistenUpdate: () => void;
    let unlistenStart: () => void;

    const setupClipboardListeners = async () => {
      console.log('[clipboard] setupClipboardListeners');
      try {
        // 创建防抖的剪贴板处理函数
        const onClipboardUpdate = debounce(
          async () => {
            // 如果是程序写入的数据,跳过处理
            if (isProgramWriteRef.current) {
              isProgramWriteRef.current = false;
              return;
            }

            const clipboardData = await readClipboardData();

            console.log('[clipboard] clipboardData:', clipboardData);

            if (clipboardData) {
              await handleClipboardData(clipboardData);
            }
          }, 2000,
          { leading: false, trailing: true }
        );

        unlistenUpdate = await clipboard.onClipboardUpdate(onClipboardUpdate);

        unlistenStart = await clipboard.startListening();
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

  /**
   * @description 上传剪贴板内容
   */
  const { run: syncClipboard } = useRequest<SyncResponse>(apiEndpoint.sync, {
    method: 'POST',
    showError: true
  });

  const uploadClipboard = useCallback(async ({ type, content }: { type: string, content: string }) => {
    const result = await syncClipboard({
      body: JSON.stringify({
        type,
        content,
        key: apiKeyRef.current,
        clientId: socketRef.current?.id
      })
    });

    if (result) {
      console.log('[clipboard] upload success:', result);
    }
  }, [syncClipboard, apiBaseUrlRef, apiKeyRef, socket]);

  // 添加一个引用来存储最后处理的内容
  const lastContentRef = useRef<string>('');

  // 添加引用来存储加密相关的状态
  const enableE2ERef = useRef(enableE2E);
  const e2ePasswordRef = useRef(password);

  // 更新引用值
  useEffect(() => {
    enableE2ERef.current = enableE2E;
    e2ePasswordRef.current = password;
  }, [enableE2E, password]);

  /**
   * @description 处理剪贴板数据
   */
  const handleClipboardData = useCallback(async (data: ClipboardData) => {
    const { type, content, source, plaintext } = data;

    // 处理内容
    let processedContent = content;
    if (source === 'remote' && enableE2ERef.current) {
      processedContent = decryptContent(content, e2ePasswordRef.current);
      console.log('[clipboard] decrypt content:', processedContent);
    }

    // 跳过重复内容
    if (processedContent === lastContentRef.current) {
      console.log('[clipboard] skip duplicate content');
      return;
    }
    lastContentRef.current = processedContent;

    // 写入剪贴板
    try {
      // 在写入剪贴板前设置标记，表示这是程序写入的数据
      isProgramWriteRef.current = true;
      await writeToClipboard(type, processedContent, plaintext);
    } catch (error) {
      console.error('[clipboard] failed to write clipboard:', error);
      return;
    }

    // 同步到云端
    if (source === 'local') {
      const uploadContent = enableE2ERef.current
        ? encryptContent(processedContent, e2ePasswordRef.current)
        : processedContent;

      await uploadClipboard({
        type,
        content: uploadContent
      });
    }
  }, []);

  if (tauriLoading) {
    return <Center h={'100%'}><Loader size={'lg'} /></Center>;
  }

  const SocketState = () => {
    const Tip = () => {
      return <Stack gap={'0'}>
        <Text size='xs'>{socketStateText}</Text>
        <Text size='xs'>{t('Client ID')}: {socketRef.current?.id || '-'}</Text>
        <Text size='xs'>{t('API Key')}: {apiKeyRef.current || '-'}</Text>
        <Text size='xs' hidden={!apiConfig}>{t('clipboard_size')}: {apiConfig?.clipboard_size || '-'}</Text>
        <Text size='xs' hidden={!apiConfig}>{t('clipboard_ttl')}: {apiConfig?.clipboard_ttl || '-'}</Text>
      </Stack>
    }

    return <Tooltip label={<Tip />} arrowSize={10} withArrow position="top-start">
      <Group justify='center' align='center' wrap="nowrap" w={'80%'} h={'80%'} style={{ cursor: 'pointer' }}>
        <Text c={socketStateColor} size='xs'>●</Text>
      </Group>
    </Tooltip>
  }

  // <> is an alias for <React.Fragment>
  return <Stack h={'100%'} gap={'sm'} pos={'relative'}>
    <Group justify='end' wrap="nowrap" gap="xs" pos={'absolute'} top={'-0.3rem'} right={0}>
      <Anchor size={'xs'} c={language === 'en_US' ? 'blue' : 'dimmed'} onClick={() => changeLanguage('en_US')}>EN</Anchor>
      <Anchor size={'xs'} c={language === 'zh_CN' ? 'blue' : 'dimmed'} onClick={() => changeLanguage('zh_CN')}>中文</Anchor>
    </Group>

    <Text size={'sm'} style={{ marginBottom: '-.5rem' }}>{t('API Endpoint')}</Text>
    <Group justify="space-between" wrap="nowrap">
      <div style={{ width: '100%' }}>
        <TextInput
          leftSection={<SocketState />}
          placeholder={t('Input API Endpoint')}
          value={tmpUrl}
          onBlur={() => changeApiBaseUrl(tmpUrl)}
          onChange={e => setTmpUrl(e.currentTarget.value.trim())}
        />
      </div>
      <Button
        size='xs'
        loading={apiKeyLoading}
        onClick={getApiKey}
        style={{ flexShrink: 0 }}
      >
        {t('Get-Key')}
      </Button>
    </Group>

    <Text size={'sm'} style={{ marginBottom: '-.5rem' }}>{t('End-to-End Encryption')}</Text>
    <Group justify="space-between" wrap="nowrap">
      <div style={{ width: '100%' }}>
        <PasswordInput
          leftSection={<TbFingerprint size={20} strokeWidth={1.5} />}
          placeholder={t('Input End-to-End Password')}
          value={password}
          minLength={PASSWORD_CONSTANTS.MIN_LENGTH}
          maxLength={PASSWORD_CONSTANTS.MAX_LENGTH}
          required
          disabled={!enableE2E}
          onBlur={() => checkPassword(password)}
          onChange={(e) => setPassword(e.currentTarget.value.trim())}
        />
      </div>
      <Switch onLabel={t('ON')} offLabel={t('OFF')} size="md" checked={enableE2E} onChange={e => setEnableE2E(e.currentTarget.checked)} />
    </Group>

    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="sm">{t('Start at Login')}</Text>
        <Text size="xs" c="dimmed">
          {t('It will start automatically when the system starts')}
        </Text>
      </div>
      <Switch onLabel={t('ON')} offLabel={t('OFF')} size="md" checked={startAtLogin} onChange={e => setStartAtLogin(e.currentTarget.checked)} />
    </Group>

    <Group style={{ marginTop: 'auto', marginBottom: '-.3rem' }} justify="center" wrap="nowrap" gap="xs">
      <Text size="xs" c="dimmed">Cloudboard v{t('0.1')}</Text>
      <Text size="xs" c="dimmed">
        <Anchor c="dimmed" href='https://github.com/journey-ad/cloudboard' target='_blank' >{t('Github')}</Anchor>
      </Text>
    </Group>

  </Stack>
}
