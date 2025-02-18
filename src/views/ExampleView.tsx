// component example
import { Anchor, Button, Center, Checkbox, Grid, Group, Loader, PasswordInput, Stack, Switch, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { TbFingerprint } from 'react-icons/tb';
import { Trans, useTranslation } from 'react-i18next';
import {notify, join, decryptContent, encryptContent, writeToClipboard, readClipboardData, formatBytes} from '../common/utils';
import { createStorage } from '../tauri/storage';
import { APP_NAME, RUNNING_IN_TAURI, useMinWidth, useTauriContext } from '../tauri/TauriProvider';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import * as Autostart from '@tauri-apps/plugin-autostart';
import clipboard from "tauri-plugin-clipboard-api";
import { API_CONSTANTS, PASSWORD_CONSTANTS, SOCKET_CONFIG } from '../constants';
import { useFetch, useRequest, useWebsocket } from '../hooks';
import { debounce, result } from 'lodash-es';


export default function MainView() {
  const { t, i18n } = useTranslation();
  const { fileSep, documents, loading: tauriLoading } = useTauriContext();

  // 存储相关初始化
  const storeName = RUNNING_IN_TAURI ? join(fileSep, documents!, APP_NAME, 'config.dat') : 'config';
  const { use: useKVP, loading, data } = createStorage(storeName);

  const [apiBaseUrlConfig, setApiBaseUrlConfig] = useKVP('apiBaseUrl', API_CONSTANTS.DEFAULT_URL);
  const [apiKeyConfig, setApiKeyConfig] = useKVP('apiKey', '');

  const apiBaseUrlRef = useRef(apiBaseUrlConfig);
  const apiKeyRef = useRef(apiKeyConfig);

  // 临时URL状态（仅用于输入框）
  const [apiBaseUrlInputValue, setApiBaseUrlInputValue] = useState(apiBaseUrlConfig);

  const changeApiBaseUrl = useCallback(async (url: string) => {
    try {
      const REGEX = /^https?:\/\/.*$/;
      const parsedUrl = new URL(url);

      if (!REGEX.test(parsedUrl.toString())) {
        throw new Error('Invalid API Endpoint');
      }

      // 更新状态值
      apiBaseUrlRef.current = parsedUrl.toString();

      // 写入配置
      setApiBaseUrlConfig(parsedUrl.toString());

      // 获取配置
      getConfig();

    } catch (error) {
      console.error('[MainView] changeApiBaseUrl error:', error);
      notifications.show({
        title: t('Error'),
        message: t('Invalid API Endpoint'),
        color: 'red',
      });
    }
  }, [setApiBaseUrlConfig, apiBaseUrlRef]);
  // apiBaseUrlRef变更后处理
  useEffect(() => {
    if (apiBaseUrlRef.current !== apiBaseUrlInputValue) {
      setApiBaseUrlInputValue(apiBaseUrlRef.current); // 同步到输入框
    }
  }, [apiBaseUrlRef.current]);
  // 初始化
  useEffect(() => {
    if (loading) return;
    console.log('[MainView] useEffect', apiBaseUrlRef.current, apiBaseUrlConfig);

    if (apiBaseUrlRef.current !== apiBaseUrlConfig) {
      apiBaseUrlRef.current = apiBaseUrlConfig;
      setApiBaseUrlInputValue(apiBaseUrlConfig); // 同步到输入框
    }
  }, [loading, apiBaseUrlConfig]);


  // 定义 API 接口
  // const getApiEndpoint = useCallback(() => {
  //   if (!apiBaseUrlRef.current) return null;

  //   return {
  //     keyGen: `${apiBaseUrlRef.current}/key-gen`,
  //     config: `${apiBaseUrlRef.current}/config`,
  //     sync: `${apiBaseUrlRef.current}/sync`,
  //     wsUrl: new URL(apiBaseUrlRef.current).origin
  //   }
  // }, [apiBaseUrlRef.current]);

  const apiEndpoint = useMemo(() => {
    if (!apiBaseUrlRef.current) return null;

    return {
      keyGen: `${apiBaseUrlRef.current}/key-gen`,
      config: `${apiBaseUrlRef.current}/config`,
      sync: `${apiBaseUrlRef.current}/sync`,
      wsUrl: new URL(apiBaseUrlRef.current).origin
    }
  }, [apiBaseUrlRef.current]);

  /**
   * @description 获取API配置 包含大小限制和过期时间等数据
   */
  const [apiConfig, setApiConfig] = useState<ConfigResponse | null>(null);
  const { refetch: getConfig } = useFetch<ConfigResponse>(apiEndpoint?.config, { autoInvoke: false });
  useEffect(() => {
    if (!apiBaseUrlRef.current || loading) return;
    getConfig()
      .then((res) => {
        if (!res) return;
        console.log(`[MainView] getConfig url=${apiEndpoint?.config} res=`, res);
        setApiConfig(res);
        copyApiKey(false);
      })
      .catch((err) => {
        console.error(`[MainView] getConfig url=${apiEndpoint?.config} error:`, err);
        notifications.show({
          title: t('Error'),
          message: t('Failed to get API config'),
          color: 'red'
        });
      });
  }, [getConfig, apiBaseUrlRef.current, loading]);


  /**
   * @description 获取并复制API密钥
   */
  const { refetch: getApiKey, loading: apiKeyLoading } = useFetch<ApiKeyResponse>(apiEndpoint?.keyGen, { autoInvoke: false });
  const copyApiKey = useCallback(async (notify = true) => {
    if (apiKeyLoading) return;

    // 如果API密钥为空，则获取API密钥
    if (!apiKeyRef.current) {
      getApiKey()
        .then((res) => {
          console.log('[MainView] getApiKey res:', res);
          if (res?.key) {
            // 写入配置
            apiKeyRef.current = res.key;
            setApiKeyConfig(res.key);
          }
        })
        .catch((err) => {
          console.error('[MainView] getApiKey error:', err);
        });
    }

    if (notify) {
      // 写入剪贴板
      await clipboard.writeText(apiKeyRef.current);
      notifications.show({
        title: t('Success'),
        message: t('API Key has been copied to the clipboard'),
        color: 'green'
      });
    }

    console.log('[MainView] copyApiKey', apiKeyRef.current);
  }, [apiKeyLoading, apiKeyRef.current, setApiKeyConfig]);
  useEffect(() => {
    apiKeyRef.current = apiKeyConfig;
  }, [apiKeyConfig]);


  /**
   * 多语言相关处理
   */
  const systemLanguage = navigator.language.replace('-', '_');
  const [language, setLanguage] = useKVP('language', systemLanguage);
  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setLanguage(lang);
  }


  /**
   * @description 端到端加密
   */
  const [enableEncryption, setEnableEncryption] = useKVP('enableEncryption', false);
  const [password, setPassword] = useKVP('encryptionPassword', '');
  const enableEncryptionRef = useRef(enableEncryption);
  const encryptionPasswordRef = useRef(password);
  const checkPassword = useCallback((password: string) => {
    // if (password.length < PASSWORD_CONSTANTS.MIN_LENGTH || password.length > PASSWORD_CONSTANTS.MAX_LENGTH) {
    //   notifications.show({
    //     title: 'Error',
    //     message: 'Password must be between 6 and 32 characters',
    //     color: 'red'
    //   });
    //   return false;
    // }
    setPassword(password);
    return true;
  }, []);
  useEffect(() => {
    enableEncryptionRef.current = enableEncryption;
    encryptionPasswordRef.current = password;
  }, [enableEncryption, password]);


  /**
   * @description 开机启动
   */
  const [startAtLogin, setStartAtLogin] = useKVP('startAtLogin', false);
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
        setStartAtLogin(false);
      }
    };

    setAutostart();
  }, []);


  /**
   * @description WebSocket连接处理
   */
  const { socket, socketRef, isConnecting, isConnected, error } = useWebsocket({
    url: apiEndpoint?.wsUrl
  });
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

  /**
   * @description 本地剪贴板相关
   */
  const isProgramWriteRef = useRef(false); // 标记是否是程序写入的数据 避免重复处理
  // 监听本地剪贴板变化
  const isListening = useRef(false);

  useEffect(() => {
    if (isListening.current) {
      return;
    }
    isListening.current = true;

    console.log('[clipboard] isListening:', isListening.current);

    let unlistenUpdate: () => void;
    let unlistenStart: () => void;

    const setupClipboardListeners = async () => {
      try {
        // 在2秒内重复触发的，只处理最后一次
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
   * @description 处理剪贴板数据
   */
  // 添加一个引用来存储最后处理的内容
  const lastContentRef = useRef<string>('');
  // 上传剪贴板内容
  const { refetch: syncClipboard } = useFetch<SyncResponse>(apiEndpoint?.sync, { autoInvoke: false });
  const uploadClipboard = useCallback(async ({ type, content }: { type: string, content: string }) => {
    if (!socketRef.current?.id) return;

    console.log('[clipboard] uploadClipboard:', { type, content });
    syncClipboard({
      method: 'POST',
      body: JSON.stringify({
        type,
        content,
        key: apiKeyRef.current,
        clientId: socketRef.current?.id
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    })
      ?.then((res) => {
        console.log(apiEndpoint)
        console.log('[clipboard] upload res:', res);
        if (res?.code === 200) {
          notifications.show({
            title: t('Success'),
            message: t('Clipboard data uploaded successfully'),
            color: 'green'
          });
        } else {
          notifications.show({
            title: t('UploadError'),
            message: `${res?.code}, ${res?.msg}`,
            color: 'red'
          });
        }
      })
      ?.catch((err) => {
        console.error('[clipboard] upload error:', err);
        notifications.show({
          title: t('Error'),
          message: t('Failed to upload clipboard data'),
          color: 'red'
        });
      });
  }, [syncClipboard, apiKeyRef.current, socketRef.current?.id]);
  const handleClipboardData = useCallback(async (data: ClipboardData) => {
    const { type, content, source, plaintext } = data;
    // 处理内容
    let processedContent = content;
    // 如果内容是远程来源，并且启用了端到端加密，则解密内容
    if (source === 'remote' && enableEncryptionRef.current) {
      processedContent = decryptContent(content, encryptionPasswordRef.current);
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
      const content = enableEncryptionRef.current
        ? encryptContent(processedContent, encryptionPasswordRef.current)
        : processedContent;

      await uploadClipboard({ type, content });
    }
  }, [enableEncryptionRef.current, encryptionPasswordRef.current, uploadClipboard]);


  const SocketState: React.FC = () => {
    const Tip: React.FC = () => (
      <Stack gap={'0'}>
        <Text size='xs'>{socketStateText}</Text>
        <Text size='xs'>{t('Client ID')}: {socketRef.current?.id || '-'}</Text>
        <Text size='xs' hidden={!apiConfig}>{t('clipboard_size', { size: apiConfig?.clipboard_size ? formatBytes(apiConfig?.clipboard_size) : '-' })}</Text>
        <Text size='xs' hidden={!apiConfig}>{t('clipboard_ttl', { ttl: apiConfig?.clipboard_ttl || '-' })}</Text>
      </Stack>
    );

    return (
      <Tooltip label={<Tip />} arrowSize={10} withArrow position="top-start">
        <Group justify='center' align='center' wrap="nowrap" w={'80%'} h={'80%'} style={{ cursor: 'pointer' }}>
          <Text c={socketStateColor} size='xs'>●</Text>
        </Group>
      </Tooltip>
    );
  };

  if (tauriLoading || loading) {
    return <Center h={'100%'}><Loader size={'lg'} /></Center>;
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
          value={apiBaseUrlInputValue}
          onBlur={() => changeApiBaseUrl(apiBaseUrlInputValue)}
          onChange={e => setApiBaseUrlInputValue(e.currentTarget.value.trim())}
        />
      </div>
      <Button
        size='xs'
        loading={apiKeyLoading}
        onClick={() => copyApiKey(true)}
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
          disabled={!enableEncryption}
          onBlur={() => checkPassword(password)}
          onChange={(e) => setPassword(e.currentTarget.value.trim())}
        />
      </div>
      <Switch onLabel={t('ON')} offLabel={t('OFF')} size="md" checked={enableEncryption} onChange={e => setEnableEncryption(e.currentTarget.checked)} />
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
