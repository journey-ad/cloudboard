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
 * 剪贴板数据来源
 */
type ClipboardSource = 'local' | 'remote';

/**
 * 剪贴板数据类型
 */
interface ClipboardData {
  type: string;
  content: string;
  source: ClipboardSource;
}

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
  const [apiBaseUrl, setApiBaseUrl] = useKVP('apiBaseUrl', 'https://clip.ovo.re/api/v1');
  const [tmp_apiBaseUrl, setTmpApiBaseUrl] = useState(apiBaseUrl);
  const [apiKey, setApiKey] = useKVP('apiKey', '');
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  const apiBaseUrlRef = useRef(apiBaseUrl);
  const apiKeyRef = useRef(apiKey);
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

    setApiBaseUrl(url);
  }, [useKVP]);

  useEffect(() => {
    if (loading) {
      return;
    }

    apiBaseUrlRef.current = apiBaseUrl;
    apiKeyRef.current = apiKey;

    console.log('[ExampleView] useEffect', apiBaseUrl, apiKey);
  }, [loading, apiBaseUrl, apiKey]);

  useEffect(() => {
    apiBaseUrlRef.current = apiBaseUrl;
    if (apiBaseUrl && apiBaseUrl !== tmp_apiBaseUrl) {
      setTmpApiBaseUrl(apiBaseUrl);
    }
  }, [apiBaseUrl]);

  const [endToEndEncryption, setEndToEndEncryption] = useKVP('endToEndEncryption', false);
  const [endToEndEncryptionPassword, setEndToEndEncryptionPassword] = useKVP('endToEndEncryptionPassword', '');

  // 获取API密钥
  const fetchApiKey = useCallback(async () => {
    try {
      setApiKeyLoading(true);
      const response = await fetch(`${apiBaseUrlRef.current}/key-gen`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Cloudboard-Version': '0.1.0'
        }
      });
      const data = await response.json();
      setApiKey(data.key);
      setApiKeyLoading(false);
    } catch (error) {
      console.error('Failed to get API key:', error);
      notifications.show({
        title: 'Error',
        message: `操作失败: ${error}`,
        color: 'red'
      });
    }
  }, [setApiKey]);

  const getApiKey = useCallback(async () => {
    if (apiKeyLoading) {
      return;
    }

    if (!apiKey) {
      await fetchApiKey();
    }

    // 写入剪贴板
    await clipboard.writeText(apiKey);
    notifications.show({
      title: t('Success'),
      message: t('API Key has been copied to the clipboard'),
      color: 'green'
    });
  }, [fetchApiKey, apiKeyLoading, apiKey]);

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

  // fs example
  async function createFile() {
    if (RUNNING_IN_TAURI) {
      try {
        // 使用 BaseDirectory.Download 确保写入下载目录
        await fs.writeTextFile(
          'example_file.txt',
          'oh this is from TAURI! COOLIO.\n',
          {
            baseDir: fs.BaseDirectory.Download
          }
        );

        // 打开下载目录
        if (downloads) {
          await shell.open(downloads);
        }

        // 调用 Rust 函数
        const msg = await invoke('process_file', {
          filepath: `${downloads}/example_file.txt`
        });

        // 显示通知
        notify('Message from Rust', msg as string);
        notifications.show({
          title: 'Message from Rust',
          message: msg as string
        });
      } catch (error) {
        console.error('File operation failed:', error);
        notifications.show({
          title: 'Error',
          message: `操作失败: ${error}`,
          color: 'red'
        });
      }
    }
  }

  /**
   * 使用WebSocket连接
   * @param {object} props WebSocket配置
   * @param {boolean} shouldConnect 是否应该连接
   */
  const { socket, isConnected } = useWebsocketConnection({
    url: new URL(apiBaseUrlRef.current).host
  }, !loading);

  // 监听云端剪贴板变化
  useEffect(() => {
    if (isConnected) {
      console.log('socket connected');

      socket?.emit('auth', apiKey);
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
  }, [isConnected, socket, apiKey]);

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
      const response = await fetch(`${apiBaseUrlRef.current}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cloudboard-Version': '0.1.0'
        },
        body: JSON.stringify({
          type,
          content,
          key: apiKeyRef.current
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
   * 处理剪贴板数据
   * @param {ClipboardData} data 剪贴板数据
   */
  const handleClipboardData = useCallback(async (data: ClipboardData) => {
    const { type, content, source } = data;
    
    // 如果是远程数据,需要进行解密
    let processedContent = content;
    if (source === 'remote' && endToEndEncryptionRef.current) {
      processedContent = CryptoJS.AES.decrypt(content, endToEndEncryptionPasswordRef.current).toString(CryptoJS.enc.Utf8) || content;
      console.log('[clipboard] decrypt', content, processedContent);
    }
    
    // 检查是否是重复内容
    if (processedContent === lastContentRef.current) {
      console.log('[clipboard] skip duplicate content');
      return;
    }
    
    // 更新最后处理的内容
    lastContentRef.current = processedContent;

    // 写入剪贴板前设置标记
    if (source === 'remote') {
      isCloudboardChangeRef.current = true;
    }

    // 写入剪贴板
    try {
      if (type === 'text') {
        await clipboard.writeText(processedContent);
      } else if (type === 'image') {
        await clipboard.writeImageBase64(processedContent);
      } else if (type === 'html') {
        await clipboard.writeHtml(processedContent);
      }
    } catch (error) {
      console.error('[clipboard] failed to write clipboard:', error);
      return;
    }

    // 如果是本地数据,需要同步到云端
    if (source === 'local') {
      let content = processedContent;
      console.log('[clipboard] local', content, endToEndEncryptionRef.current, endToEndEncryptionPasswordRef.current);
      if (endToEndEncryptionRef.current) {
        content = CryptoJS.AES.encrypt(processedContent, endToEndEncryptionPasswordRef.current).toString();
        console.log('[clipboard] encrypt', processedContent, content);
      }

      uploadClipboard({
        type,
        content
      });
    }
  }, []); // 移除依赖,使用 ref 来访问最新值

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
        <TextInput placeholder={t('Input API Endpoint')} value={tmp_apiBaseUrl} onBlur={() => changeApiBaseUrl(tmp_apiBaseUrl)} onChange={e => setTmpApiBaseUrl(e.currentTarget.value.trim())} />
      </div>
      <Button size='xs' loading={apiKeyLoading} onClick={getApiKey} style={{ flexShrink: 0 }}>{t('Get-Key')}</Button>
    </Group>

    <Text size={'sm'} style={{ marginBottom: '-.5rem' }}>{t('End-to-End Encryption')}</Text>
    <Group justify="space-between" wrap="nowrap">
      <div style={{ width: '100%' }}>
        <PasswordInput placeholder={t('Input End-to-End Password')} value={endToEndEncryptionPassword} onChange={e => setEndToEndEncryptionPassword(e.currentTarget.value)} disabled={!endToEndEncryption} />
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

    {/* <Button onClick={createFile}>Do something with fs</Button>

    <Button onClick={toggleFullscreen}>Toggle Fullscreen</Button>

    <Button onClick={() => notifications.show({ title: 'Mantine Notification', message: 'test v6 breaking change' })}>Notification example</Button>

    <Title order={4}>Interpolating components in translations</Title>
    <Trans i18nKey='transExample'
      values={{ variable: 'github.com/elibroftw/modern-desktop-template' }}
      components={[<Anchor href='https://github.com/elibroftw/modern-desktop-app-template' />]}
      // optional stuff:
      default='FALLBACK if key does not exist. This template is from <0>github.com{{variable}}</0>' t={t} /> */}

    {/* {loading ? <Text>Loading Tauri Store</Text> :
			<>
				<TextInput label={'Persistent data'} value={apiEndpoint} onChange={e => setExampleData(e.currentTarget.value)} />
				<Button onClick={() => revealItemInDir(storeName)}>Reveal store file in file directory</Button>
			</>
		} */}
  </Stack>
}
