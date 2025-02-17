import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

interface WebSocketConfig {
  url: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

interface WebSocketState {
  isConnecting: boolean;
  isConnected: boolean;
  error: Error | null;
}

interface WebSocketReturn extends WebSocketState {
  socket: Socket | null;
  socketRef: React.MutableRefObject<Socket | null>;
  emit: <T>(event: string, data: T) => void;
  on: <T>(event: string, callback: (data: T) => void) => void;
  off: <T>(event: string, callback: (data: T) => void) => void;
  connect: () => void;
  disconnect: () => void;
}

const DEFAULT_RECONNECT_ATTEMPTS = 3;
const DEFAULT_RECONNECT_INTERVAL = 3000;

const useWebsocketConnection = (
  config: WebSocketConfig,
  shouldConnect = true
): WebSocketReturn => {
  const { url, reconnectAttempts = DEFAULT_RECONNECT_ATTEMPTS, reconnectInterval = DEFAULT_RECONNECT_INTERVAL } = config;
  const socketRef = useRef<Socket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>(null);

  const [state, setState] = useState<WebSocketState>({
    isConnecting: false,
    isConnected: false,
    error: null,
  });

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();
    setState(prev => ({ ...prev, isConnecting: true }));

    const socket = io(url, {
      transports: ['websocket'],
      reconnection: false, // 我们自己处理重连逻辑
    });

    socket.on('connect', () => {
      reconnectCountRef.current = 0;
      setState({
        isConnecting: false,
        isConnected: true,
        error: null,
      });
    });

    socket.on('disconnect', () => {
      setState(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
      }));

      // 尝试重连
      if (reconnectCountRef.current < reconnectAttempts) {
        reconnectCountRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      }
    });

    socket.on('connect_error', (error: Error) => {
      setState({
        isConnecting: false,
        isConnected: false,
        error,
      });
    });

    socketRef.current = socket;
  }, [url, reconnectAttempts, reconnectInterval, cleanup]);

  useEffect(() => {
    if (shouldConnect) {
      connect();
    }
    return cleanup;
  }, [shouldConnect, connect, cleanup]);

  const emit = useCallback(<T,>(event: string, data: T) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback(<T,>(event: string, callback: (data: T) => void) => {
    socketRef.current?.on(event, callback);
  }, []);

  const off = useCallback(<T,>(event: string, callback: (data: T) => void) => {
    socketRef.current?.off(event, callback);
  }, []);

  return {
    ...state,
    socket: socketRef.current,
    socketRef,
    emit,
    on,
    off,
    connect,
    disconnect: cleanup,
  };
};

export default useWebsocketConnection;
